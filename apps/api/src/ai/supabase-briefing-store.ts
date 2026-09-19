import type { SupabaseClient } from '@supabase/supabase-js';
import { createEmptyBriefing, type Briefing, type CreationMode } from '@caneca-facil/core';
import type { ConversationBriefingStore } from './briefing-store.js';

type BriefingRow = {
  id?: string;
  project_id?: string;
  version?: number;
  creation_mode?: CreationMode | null;
  occasion?: string | null;
  recipient?: string | null;
  main_theme?: string | null;
  desired_style?: string | null;
  color_preferences?: string[] | null;
  mandatory_text?: string[] | null;
  names?: string[] | null;
  dates?: string[] | null;
  mandatory_elements?: string[] | null;
  forbidden_elements?: string[] | null;
  reference_items?: Briefing['references'] | null;
  composition_notes?: string | null;
  creative_direction?: string | null;
  missing_information?: string[] | null;
  confidence_score?: number | string | null;
  ready_to_generate?: boolean | null;
};

type BriefingStateRpcRow = {
  project_id: string;
  briefing_id: string;
  version: number;
  briefing: BriefingRow;
};

export function mapBriefingRow(row: BriefingRow): Briefing {
  return {
    creationMode: row.creation_mode ?? 'from_scratch',
    ...(row.occasion ? { occasion: row.occasion } : {}),
    ...(row.recipient ? { recipient: row.recipient } : {}),
    ...(row.main_theme ? { mainTheme: row.main_theme } : {}),
    ...(row.desired_style ? { desiredStyle: row.desired_style } : {}),
    colorPreferences: row.color_preferences ?? [],
    mandatoryText: row.mandatory_text ?? [],
    names: row.names ?? [],
    dates: row.dates ?? [],
    mandatoryElements: row.mandatory_elements ?? [],
    forbiddenElements: row.forbidden_elements ?? [],
    references: row.reference_items ?? [],
    ...(row.composition_notes ? { compositionNotes: row.composition_notes } : {}),
    ...(row.creative_direction ? { creativeDirection: row.creative_direction } : {}),
    missingInformation: row.missing_information ?? [],
    confidenceScore: Number(row.confidence_score ?? 0),
    readyToGenerate: Boolean(row.ready_to_generate),
  };
}

export function createSupabaseConversationBriefingStore(
  client: SupabaseClient,
): ConversationBriefingStore {
  return {
    async load(conversationId) {
      const conversation = await client
        .from('conversations')
        .select('id,automation_mode,active_project_id')
        .eq('id', conversationId)
        .single();

      if (conversation.error || !conversation.data) {
        throw new Error(
          `Failed to load conversation briefing context: ${conversation.error?.message ?? 'conversation not found'}`,
        );
      }

      const automationMode = conversation.data.automation_mode as
        | 'ai'
        | 'human'
        | 'paused';

      if (automationMode !== 'ai') {
        return {
          conversationId,
          automationMode,
          projectId: (conversation.data.active_project_id as string | null) ?? null,
          briefingId: null,
          briefing: createEmptyBriefing(),
        };
      }

      const ensured = await client
        .rpc('ensure_chat_briefing_state', {
          p_conversation_id: conversationId,
        })
        .single();

      if (ensured.error || !ensured.data) {
        throw new Error(
          `Failed to ensure conversation briefing state: ${ensured.error?.message ?? 'unknown error'}`,
        );
      }

      const state = ensured.data as BriefingStateRpcRow;
      return {
        conversationId,
        automationMode,
        projectId: state.project_id,
        briefingId: state.briefing_id,
        briefing: mapBriefingRow(state.briefing),
      };
    },

    async saveVersion(input) {
      if (!input.previousBriefingId) {
        throw new Error('Cannot append briefing version without a current briefing');
      }

      const previous = await client
        .from('briefings')
        .select('version')
        .eq('id', input.previousBriefingId)
        .eq('project_id', input.projectId)
        .single();

      if (previous.error || !previous.data) {
        throw new Error(
          `Failed to resolve current briefing version: ${previous.error?.message ?? 'briefing not found'}`,
        );
      }

      const appended = await client
        .rpc('append_chat_briefing_version', {
          p_conversation_id: input.conversationId,
          p_project_id: input.projectId,
          p_expected_version: Number(previous.data.version),
          p_briefing: input.briefing,
        })
        .single();

      if (appended.error || !appended.data) {
        throw new Error(
          `Failed to append briefing version: ${appended.error?.message ?? 'unknown error'}`,
        );
      }

      const state = appended.data as BriefingStateRpcRow;
      return {
        briefingId: state.briefing_id,
        version: Number(state.version),
      };
    },
  };
}
