import type { SupabaseClient } from '@supabase/supabase-js';
import { createEmptyBriefing, type Briefing, type CreationMode } from '@caneca-facil/core';
import type { ConversationBriefingStore } from './briefing-store.js';

type BriefingRow = {
  id: string;
  project_id: string;
  version: number;
  creation_mode: CreationMode | null;
  occasion: string | null;
  recipient: string | null;
  main_theme: string | null;
  desired_style: string | null;
  color_preferences: string[] | null;
  mandatory_text: string[] | null;
  names: string[] | null;
  dates: string[] | null;
  mandatory_elements: string[] | null;
  forbidden_elements: string[] | null;
  reference_items: Briefing['references'] | null;
  composition_notes: string | null;
  creative_direction: string | null;
  missing_information: string[] | null;
  confidence_score: number | string | null;
  ready_to_generate: boolean;
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
    readyToGenerate: row.ready_to_generate,
  };
}

function briefingInsert(projectId: string, version: number, briefing: Briefing) {
  return {
    project_id: projectId,
    version,
    creation_mode: briefing.creationMode,
    occasion: briefing.occasion ?? null,
    recipient: briefing.recipient ?? null,
    main_theme: briefing.mainTheme ?? null,
    desired_style: briefing.desiredStyle ?? null,
    color_preferences: briefing.colorPreferences,
    mandatory_text: briefing.mandatoryText,
    names: briefing.names,
    dates: briefing.dates,
    mandatory_elements: briefing.mandatoryElements,
    forbidden_elements: briefing.forbiddenElements,
    reference_items: briefing.references,
    composition_notes: briefing.compositionNotes ?? null,
    creative_direction: briefing.creativeDirection ?? null,
    missing_information: briefing.missingInformation,
    confidence_score: briefing.confidenceScore,
    ready_to_generate: briefing.readyToGenerate,
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
        throw new Error(`Failed to load conversation briefing context: ${conversation.error?.message ?? 'conversation not found'}`);
      }

      const projectId = conversation.data.active_project_id as string | null;
      const automationMode = conversation.data.automation_mode as 'ai' | 'human' | 'paused';
      if (!projectId) {
        return {
          conversationId,
          automationMode,
          projectId: null,
          briefingId: null,
          briefing: createEmptyBriefing(),
        };
      }

      const project = await client
        .from('mug_projects')
        .select('id,current_briefing_id,creation_mode')
        .eq('id', projectId)
        .eq('conversation_id', conversationId)
        .single();

      if (project.error || !project.data) {
        throw new Error(`Failed to load active mug project: ${project.error?.message ?? 'project not found'}`);
      }

      const briefingId = project.data.current_briefing_id as string | null;
      if (!briefingId) {
        return {
          conversationId,
          automationMode,
          projectId,
          briefingId: null,
          briefing: createEmptyBriefing((project.data.creation_mode as CreationMode | null) ?? 'from_scratch'),
        };
      }

      const briefingResult = await client
        .from('briefings')
        .select('*')
        .eq('id', briefingId)
        .eq('project_id', projectId)
        .single();

      if (briefingResult.error || !briefingResult.data) {
        throw new Error(`Failed to load current briefing: ${briefingResult.error?.message ?? 'briefing not found'}`);
      }

      return {
        conversationId,
        automationMode,
        projectId,
        briefingId,
        briefing: mapBriefingRow(briefingResult.data as BriefingRow),
      };
    },

    async saveVersion(input) {
      const latest = await client
        .from('briefings')
        .select('version')
        .eq('project_id', input.projectId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest.error) {
        throw new Error(`Failed to resolve briefing version: ${latest.error.message}`);
      }
      const version = Number(latest.data?.version ?? 0) + 1;

      const inserted = await client
        .from('briefings')
        .insert(briefingInsert(input.projectId, version, input.briefing))
        .select('id,version')
        .single();

      if (inserted.error || !inserted.data) {
        throw new Error(`Failed to persist briefing version: ${inserted.error?.message ?? 'unknown error'}`);
      }

      let projectUpdate = client
        .from('mug_projects')
        .update({
          current_briefing_id: inserted.data.id,
          status: input.briefing.readyToGenerate ? 'ready_to_generate' : 'building_briefing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.projectId)
        .eq('conversation_id', input.conversationId);

      projectUpdate = input.previousBriefingId
        ? projectUpdate.eq('current_briefing_id', input.previousBriefingId)
        : projectUpdate.is('current_briefing_id', null);

      const updated = await projectUpdate.select('id').maybeSingle();
      if (updated.error || !updated.data) {
        await client.from('briefings').delete().eq('id', inserted.data.id);
        throw new Error(`Failed to advance current briefing pointer: ${updated.error?.message ?? 'concurrent briefing update'}`);
      }

      return {
        briefingId: inserted.data.id as string,
        version: Number(inserted.data.version),
      };
    },
  };
}
