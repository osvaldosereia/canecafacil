import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Briefing,
  BriefingMissingKey,
  BriefingReference,
  CreationMode,
} from '@caneca-facil/core';
import {
  BriefingVersionConflictError,
  type BriefingState,
  type BriefingStore,
} from './briefing-store.js';

type RpcStateRow = {
  project_id: string;
  briefing_id: string;
  version: number;
  briefing: Record<string, unknown>;
};

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function references(value: unknown): BriefingReference[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.mediaId !== 'string' || typeof record.order !== 'number') {
      return [];
    }

    return [
      {
        mediaId: record.mediaId,
        order: record.order,
        ...(typeof record.role === 'string' ? { role: record.role } : {}),
      },
    ];
  });
}

function creationMode(value: unknown): CreationMode | undefined {
  return value === 'reference' || value === 'from_scratch' ? value : undefined;
}

function missingInformation(value: unknown): BriefingMissingKey[] {
  const valid = new Set<BriefingMissingKey>([
    'creation_mode',
    'reference',
    'creative_context',
    'style_or_creative_freedom',
  ]);
  return stringArray(value).filter((item): item is BriefingMissingKey =>
    valid.has(item as BriefingMissingKey),
  );
}

function mapBriefing(value: Record<string, unknown>): Briefing {
  return {
    ...(creationMode(value.creation_mode)
      ? { creationMode: creationMode(value.creation_mode) }
      : {}),
    ...(stringOrUndefined(value.occasion)
      ? { occasion: stringOrUndefined(value.occasion) }
      : {}),
    ...(stringOrUndefined(value.recipient)
      ? { recipient: stringOrUndefined(value.recipient) }
      : {}),
    ...(stringOrUndefined(value.main_theme)
      ? { mainTheme: stringOrUndefined(value.main_theme) }
      : {}),
    ...(stringOrUndefined(value.desired_style)
      ? { desiredStyle: stringOrUndefined(value.desired_style) }
      : {}),
    colorPreferences: stringArray(value.color_preferences),
    mandatoryText: stringArray(value.mandatory_text),
    names: stringArray(value.names),
    dates: stringArray(value.dates),
    mandatoryElements: stringArray(value.mandatory_elements),
    forbiddenElements: stringArray(value.forbidden_elements),
    references: references(value.reference_items),
    ...(stringOrUndefined(value.composition_notes)
      ? { compositionNotes: stringOrUndefined(value.composition_notes) }
      : {}),
    ...(stringOrUndefined(value.creative_direction)
      ? { creativeDirection: stringOrUndefined(value.creative_direction) }
      : {}),
    creativeFreedom: value.creative_freedom === true,
    missingInformation: missingInformation(value.missing_information),
    confidenceScore: Number(value.confidence_score ?? 0),
    readyToGenerate: value.ready_to_generate === true,
  };
}

function mapState(row: RpcStateRow): BriefingState {
  return {
    projectId: row.project_id,
    briefingId: row.briefing_id,
    version: Number(row.version),
    briefing: mapBriefing(row.briefing ?? {}),
  };
}

function serializeBriefing(briefing: Briefing): Record<string, unknown> {
  return {
    ...(briefing.creationMode ? { creationMode: briefing.creationMode } : {}),
    ...(briefing.occasion ? { occasion: briefing.occasion } : {}),
    ...(briefing.recipient ? { recipient: briefing.recipient } : {}),
    ...(briefing.mainTheme ? { mainTheme: briefing.mainTheme } : {}),
    ...(briefing.desiredStyle ? { desiredStyle: briefing.desiredStyle } : {}),
    colorPreferences: briefing.colorPreferences,
    mandatoryText: briefing.mandatoryText,
    names: briefing.names,
    dates: briefing.dates,
    mandatoryElements: briefing.mandatoryElements,
    forbiddenElements: briefing.forbiddenElements,
    references: briefing.references,
    ...(briefing.compositionNotes
      ? { compositionNotes: briefing.compositionNotes }
      : {}),
    ...(briefing.creativeDirection
      ? { creativeDirection: briefing.creativeDirection }
      : {}),
    creativeFreedom: briefing.creativeFreedom,
    missingInformation: briefing.missingInformation,
    confidenceScore: briefing.confidenceScore,
    readyToGenerate: briefing.readyToGenerate,
  };
}

function firstRow(
  data: unknown,
  operation: string,
): RpcStateRow {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`${operation} returned an invalid state`);
  }
  return data[0] as RpcStateRow;
}

export function createSupabaseBriefingStore(
  client: SupabaseClient,
): BriefingStore {
  return {
    async loadOrCreate(conversationId) {
      const { data, error } = await client.rpc('ensure_chat_briefing_state', {
        p_conversation_id: conversationId,
      });

      if (error) {
        throw new Error(`Failed to load briefing state: ${error.message}`);
      }

      return mapState(firstRow(data, 'Briefing state load'));
    },

    async appendVersion(input) {
      const { data, error } = await client.rpc('append_chat_briefing_version', {
        p_conversation_id: input.conversationId,
        p_project_id: input.projectId,
        p_expected_version: input.expectedVersion,
        p_briefing: serializeBriefing(input.briefing),
      });

      if (error?.code === '40001') {
        throw new BriefingVersionConflictError();
      }
      if (error) {
        throw new Error(`Failed to append briefing version: ${error.message}`);
      }

      return mapState(firstRow(data, 'Briefing version append'));
    },
  };
}
