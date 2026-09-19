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

describe('Supabase conversation briefing store', () => {
  it('loads an AI conversation without a project as an empty briefing', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'conversation-1',
        automation_mode: 'ai',
        active_project_id: null,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const client = asClient({ from: vi.fn().mockReturnValue({ select }) });

    const store = createSupabaseConversationBriefingStore(client);
    await expect(store.load('conversation-1')).resolves.toMatchObject({
      conversationId: 'conversation-1',
      automationMode: 'ai',
      projectId: null,
      briefingId: null,
      briefing: {
        creationMode: 'from_scratch',
        readyToGenerate: false,
      },
    });
  });

  it('maps versioned briefing rows into the deterministic domain contract', () => {
    const briefing = mapBriefingRow({
      id: 'briefing-1',
      project_id: 'project-1',
      version: 2,
      creation_mode: 'reference',
      occasion: 'aniversário',
      recipient: 'Ana',
      main_theme: 'flores',
      desired_style: 'aquarela',
      color_preferences: ['lilás'],
      mandatory_text: ['Feliz aniversário'],
      names: ['Ana'],
      dates: [],
      mandatory_elements: ['flores'],
      forbidden_elements: [],
      reference_items: [{ mediaId: 'media-1', order: 1 }],
      composition_notes: null,
      creative_direction: 'delicada',
      missing_information: [],
      confidence_score: '1',
      ready_to_generate: true,
    });

    expect(briefing).toMatchObject({
      creationMode: 'reference',
      mainTheme: 'flores',
      colorPreferences: ['lilás'],
      references: [{ mediaId: 'media-1', order: 1 }],
      confidenceScore: 1,
      readyToGenerate: true,
    });
  });

  it('persists a new immutable briefing version and advances the project pointer', async () => {
    const latest = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { version: 2 }, error: null }),
            }),
          }),
        }),
      }),
    };

    const insertedPayloads: unknown[] = [];
    const insert = vi.fn((payload) => {
      insertedPayloads.push(payload);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'briefing-3', version: 3 },
            error: null,
          }),
        }),
      };
    });

    const updatePayloads: unknown[] = [];
    const updateChain: any = {
      eq: vi.fn(() => updateChain),
      is: vi.fn(() => updateChain),
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'project-1' }, error: null }),
      })),
    };
    const project = {
      update: vi.fn((payload) => {
        updatePayloads.push(payload);
        return updateChain;
      }),
    };

    let briefingCalls = 0;
    const client = asClient({
      from: vi.fn((table: string) => {
        if (table === 'briefings') {
          briefingCalls += 1;
          if (briefingCalls === 1) return latest;
          return { insert };
        }
        if (table === 'mug_projects') return project;
        throw new Error(`unexpected table ${table}`);
      }),
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
      previousBriefingId: null,
      briefing,
    })).resolves.toEqual({ briefingId: 'briefing-3', version: 3 });

    expect(insertedPayloads[0]).toMatchObject({
      project_id: 'project-1',
      version: 3,
      main_theme: 'flores',
      ready_to_generate: true,
    });
    expect(updatePayloads[0]).toMatchObject({
      current_briefing_id: 'briefing-3',
      status: 'ready_to_generate',
    });
  });
});
