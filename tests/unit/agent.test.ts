import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn()
          .mockResolvedValueOnce([{ id: 1, full_text: 'The parties agree to comply with this Agreement.', norm_text: 'the parties agree to comply with this agreement.', norm_map: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45] }])
          .mockResolvedValueOnce([{ page_no: 1, start_offset: 0, end_offset: 46 }]),
      })),
    })),
  },
}));

vi.mock('../../src/lib/agent/tools', async () => ({
  TOOL_DEFINITIONS: [
    { type: 'function', function: { name: 'search_document' } },
    { type: 'function', function: { name: 'invented_tool' } },
  ],
  executeTool: vi.fn(async (name: string) => {
    if (name === 'search_document') return { data: [{ snippet: 'The parties agree to comply with this Agreement.' }], summary: 'Found 1 passage', coverage: { sections_total: 3, sections_read: 0, pages_total: 10, pages_read: 0 } };
    throw new Error('unexpected tool');
  }),
}));

import { runAgent } from '../../src/lib/agent/run';
import { resetMockCalls } from '../../src/lib/llm/client';
import { verifyAnswerQuotes } from '../../src/lib/verification/parseQuotes';

describe('Phase 3/4 agent safeguards', () => {
  beforeEach(() => {
    process.env.LLM_MOCK = '1';
    resetMockCalls();
  });

  it('does not crash on a garbage tool call and keeps partial coverage incomplete', async () => {
    const events = [];
    for await (const event of runAgent({ docIds: [1], message: 'What does this say?' })) events.push(event);
    expect(events.some((event) => event.type === 'tool_result' && event.summary.includes('rejected'))).toBe(true);
    const done = events.find((event) => event.type === 'done');
    expect(done?.type === 'done' && done.coverage[1]?.complete).toBe(false);
  });

  it('enforces a caller-provided round cap', async () => {
    const events = [];
    for await (const event of runAgent({ docIds: [1], message: 'Keep researching', limits: { maxRounds: 1 } })) events.push(event);
    expect(events.filter((event) => event.type === 'tool_start')).toHaveLength(1);
    expect(events.some((event) => event.type === 'done')).toBe(true);
  });

  it('rejects an unselected document before querying it', async () => {
    const actualTools = await vi.importActual<typeof import('../../src/lib/agent/tools')>('../../src/lib/agent/tools');
    await expect(actualTools.executeTool('search_document', { doc_id: 2, query: 'payment', top_k: 3 }, [1])).rejects.toThrow('not selected');
  });

  it('marks an invented quote unverified', () => {
    const result = verifyAnswerQuotes('<quote doc="1">This sentence was invented for the answer.</quote>', {
      '1': { id: 1, fullText: 'The parties agree to comply with this Agreement.', normText: 'the parties agree to comply with this agreement.', map: Array.from({ length: 46 }, (_, index) => index), pages: [{ pageNo: 1, start: 0, end: 46 }] },
    });
    expect(result[0].status).toBe('unverified');
  });

  it('marks a quote unverified if attributed to doc A but existing only in doc B', () => {
    const docA = { id: 1, fullText: 'Liability is capped at AED 100,000.', normText: 'liability is capped at aed 100,000.', map: Array.from({ length: 35 }, (_, i) => i), pages: [{ pageNo: 1, start: 0, end: 35 }] };
    const docB = { id: 2, fullText: 'Liability is capped at AED 1,000,000.', normText: 'liability is capped at aed 1,000,000.', map: Array.from({ length: 37 }, (_, i) => i), pages: [{ pageNo: 1, start: 0, end: 37 }] };

    const result = verifyAnswerQuotes('<quote doc="1">Liability is capped at AED 1,000,000.</quote>', { '1': docA, '2': docB });
    expect(result[0].status).toBe('unverified');
  });

  it('verifies multi-document answer where each quote verifies against its own document', () => {
    const docA = { id: 1, fullText: 'Liability cap AED 100,000 in contract v1.', normText: 'liability cap aed 100,000 in contract v1.', map: Array.from({ length: 41 }, (_, i) => i), pages: [{ pageNo: 1, start: 0, end: 41 }] };
    const docB = { id: 2, fullText: 'Liability cap AED 1,000,000 in contract v2.', normText: 'liability cap aed 1,000,000 in contract v2.', map: Array.from({ length: 43 }, (_, i) => i), pages: [{ pageNo: 1, start: 0, end: 43 }] };

    const answer = 'V1 has <quote doc="1">Liability cap AED 100,000 in contract v1.</quote> while V2 has <quote doc="2">Liability cap AED 1,000,000 in contract v2.</quote>';
    const result = verifyAnswerQuotes(answer, { '1': docA, '2': docB });
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('verified');
    expect(result[1].status).toBe('verified');
  });
});