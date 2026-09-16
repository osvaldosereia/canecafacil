import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyBriefing } from '@caneca-facil/core';
import { createSupabaseBriefingStore } from './supabase-briefing-store.js';

function asSupabaseClient(value: unknown): SupabaseClient {
  return value as SupabaseClient;
}

function emptyBriefingRow() {
  return {
    project_id: 'project-1',
    briefing_id: 'briefing-1',
    version: 1,
    briefing: {
      creation_mode: null,
      occasion: null,
      recipient: null,
      main_theme: null,
      desired_style: null,
      color_preferences: [],
      mandatory_text: [],
      names: [],
      dates: [],
      mandatory_elements: [],
      forbidden_elements: [],
      reference_items: [],
      composition_notes: null,
      creative_direction: null,
      creative_freedom: false,
      missing_information: [
        'creation_mode',
        'creative_context',
        'style_or_creative_freedom',
      ],
      confidence_score: 0,
      ready_to_generate: false,
    },
  };
}

describe('Supabase briefing store', () => {
  it('loads or atomically creates a partial version 1 without requiring creation mode', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [emptyBriefingRow()],
      error: null,
    });
    const store = createSupabaseBriefingStore(
      asSupabaseClient({ rpc }),
    );

    const state = await store.loadOrCreate('conversation-1');

    expect(rpc).toHaveBeenCalledWith('ensure_chat_briefing_state', {
      p_conversation_id: 'conversation-1',
    });
    expect(state).toEqual({
      projectId: 'project-1',
      briefingId: 'briefing-1',
      version: 1,
      briefing: createEmptyBriefing(),
    });
  });

  it('appends a new immutable version using optimistic expected-version control', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          project_id: 'project-1',
          briefing_id: 'briefing-2',
          version: 2,
          briefing: {
            ...emptyBriefingRow().briefing,
            creation_mode: 'from_scratch',
            occasion: 'aniversário',
            recipient: 'Ana',
            desired_style: 'minimalista',
            color_preferences: ['rosa'],
            creative_freedom: false,
            missing_information: [],
            confidence_score: 0.93,
            ready_to_generate: true,
          },
        },
      ],
      error: null,
    });
    const store = createSupabaseBriefingStore(
      asSupabaseClient({ rpc }),
    );

    const briefing = createEmptyBriefing();
    briefing.creationMode = 'from_scratch';
    briefing.occasion = 'aniversário';
    briefing.recipient = 'Ana';
    briefing.desiredStyle = 'minimalista';
    briefing.colorPreferences = ['rosa'];
    briefing.missingInformation = [];
    briefing.confidenceScore = 0.93;
    briefing.readyToGenerate = true;

    const state = await store.appendVersion({
      conversationId: 'conversation-1',
      projectId: 'project-1',
      expectedVersion: 1,
      briefing,
    });

    expect(rpc).toHaveBeenCalledWith('append_chat_briefing_version', {
      p_conversation_id: 'conversation-1',
      p_project_id: 'project-1',
      p_expected_version: 1,
      p_briefing: {
        creationMode: 'from_scratch',
        occasion: 'aniversário',
        recipient: 'Ana',
        colorPreferences: ['rosa'],
        mandatoryText: [],
        names: [],
        dates: [],
        mandatoryElements: [],
        forbiddenElements: [],
        references: [],
        desiredStyle: 'minimalista',
        creativeFreedom: false,
        missingInformation: [],
        confidenceScore: 0.93,
        readyToGenerate: true,
      },
    });
    expect(state.version).toBe(2);
    expect(state.briefing.colorPreferences).toEqual(['rosa']);
    expect(state.briefing.readyToGenerate).toBe(true);
  });

  it('normalizes optimistic version conflicts instead of silently overwriting', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'briefing version conflict' },
    });
    const store = createSupabaseBriefingStore(
      asSupabaseClient({ rpc }),
    );

    await expect(
      store.appendVersion({
        conversationId: 'conversation-1',
        projectId: 'project-1',
        expectedVersion: 1,
        briefing: createEmptyBriefing(),
      }),
    ).rejects.toThrow('Briefing version conflict');
  });
});
