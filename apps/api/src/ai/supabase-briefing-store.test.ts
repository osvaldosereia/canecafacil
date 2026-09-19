import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyBriefing } from '@caneca-facil/core';
import {
  createSupabaseConversationBriefingStore,
  mapBriefingRow,
} from './supabase-briefing-store.js';

function asClient(value: unknown): SupabaseClient {
  return value as SupabaseClient;
}

function conversationQuery(data: Record<string, unknown>) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

describe('Supabase conversation briefing store', () => {
  it('does not create briefing state while human ownership is active', async () => {
    const rpc = vi.fn();
    const client = asClient({
      from: vi.fn().mockReturnValue(
        conversationQuery({
          id: 'conversation-1',
          automation_mode: 'human',
          active_project_id: null,
        }),
      ),
      rpc,
    });

    const store = createSupabaseConversationBriefingStore(client);
    await expect(store.load('conversation-1')).resolves.toMatchObject({
      automationMode: 'human',
      projectId: null,
      briefingId: null,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('atomically ensures a project and initial briefing for AI conversations', async () => {
    const rpcSingle = vi.fn().mockResolvedValue({
      data: {
        project_id: 'project-1',
        briefing_id: 'briefing-1',
        version: 1,
        briefing: {
          creation_mode: 'from_scratch',
          main_theme: 'flores',
          creative_direction: 'aquarela',
          color_preferences: [],
          mandatory_text: [],
          names: [],
          dates: [],
          mandatory_elements: [],
          forbidden_elements: [],
          reference_items: [],
          missing_information: [],
          confidence_score: 1,
          ready_to_generate: true,
        },
      },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ single: rpcSingle });
    const client = asClient({
      from: vi.fn().mockReturnValue(
        conversationQuery({
          id: 'conversation-1',
          automation_mode: 'ai',
          active_project_id: null,
        }),
      ),
      rpc,
    });

    const store = createSupabaseConversationBriefingStore(client);
    await expect(store.load('conversation-1')).resolves.toMatchObject({
      automationMode: 'ai',
      projectId: 'project-1',
      briefingId: 'briefing-1',
      briefing: {
        mainTheme: 'flores',
        readyToGenerate: true,
      },
    });
    expect(rpc).toHaveBeenCalledWith('ensure_chat_briefing_state', {
      p_conversation_id: 'conversation-1',
    });
  });

  it('maps versioned briefing rows into the deterministic domain contract', () => {
    expect(mapBriefingRow({
      creation_mode: 'reference',
      main_theme: 'flores',
      desired_style: 'aquarela',
      color_preferences: ['lilás'],
      mandatory_text: ['Feliz aniversário'],
      names: ['Ana'],
      dates: [],
      mandatory_elements: ['flores'],
      forbidden_elements: [],
      reference_items: [{ mediaId: 'media-1', order: 1 }],
      missing_information: [],
      confidence_score: '1',
      ready_to_generate: true,
    })).toMatchObject({
      creationMode: 'reference',
      mainTheme: 'flores',
      colorPreferences: ['lilás'],
      references: [{ mediaId: 'media-1', order: 1 }],
      confidenceScore: 1,
      readyToGenerate: true,
    });
  });

  it('appends the next version through the transactional RPC', async () => {
    const versionSingle = vi.fn().mockResolvedValue({
      data: { version: 2 },
      error: null,
    });
    const briefingQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: versionSingle }),
        }),
      }),
    };

    const rpcSingle = vi.fn().mockResolvedValue({
      data: {
        project_id: 'project-1',
        briefing_id: 'briefing-3',
        version: 3,
        briefing: {},
      },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ single: rpcSingle });

    const client = asClient({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'briefings') return briefingQuery;
        throw new Error(`unexpected table ${table}`);
      }),
      rpc,
    });

    const store = createSupabaseConversationBriefingStore(client);
    const briefing = {
      ...createEmptyBriefing(),
      mainTheme: 'flores',
      creativeDirection: 'aquarela',
      missingInformation: [],
      confidenceScore: 1,
      readyToGenerate: true,
    };

    await expect(store.saveVersion({
      conversationId: 'conversation-1',
      projectId: 'project-1',
      previousBriefingId: 'briefing-2',
      briefing,
    })).resolves.toEqual({ briefingId: 'briefing-3', version: 3 });

    expect(rpc).toHaveBeenCalledWith(
      'append_chat_briefing_version',
      expect.objectContaining({
        p_conversation_id: 'conversation-1',
        p_project_id: 'project-1',
        p_expected_version: 2,
        p_briefing: briefing,
      }),
    );
  });
});
