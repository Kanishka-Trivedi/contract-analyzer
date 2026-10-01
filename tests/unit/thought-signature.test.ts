import { describe, expect, it, vi } from 'vitest';

const documentText = 'The parties agree to comply with this Agreement.';
let selectCall = 0;

vi.mock('../../src/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCall += 1;
          return Promise.resolve(selectCall % 2 === 1
            ? [{ id: 1, full_text: documentText, norm_text: documentText.toLowerCase(), norm_map: Array.from({ length: documentText.length }, (_, index) => index) }]
            : [{ page_no: 140, start_offset: 0, end_offset: documentText.length }]);
        }),
      })),
    })),
  },
}));

vi.mock('../../src/lib/agent/tools', () => ({
  TOOL_DEFINITIONS: [{ type: 'function', function: { name: 'search_document' } }],
  executeTool: vi.fn(async () => ({
    data: [{ snippet: documentText }],
    summary: 'Found 1 passage',
    coverage: { sections_total: 1, sections_read: 1, pages_total: 140, pages_read: 1 },
  })),
}));

vi.mock('../../src/lib/llm/client', () => ({
  streamChatCompletion: vi.fn(),
}));

import { runAgent } from '../../src/lib/agent/run';
import { streamChatCompletion, LLMMessage } from '../../src/lib/llm/client';

describe('Gemini thought signatures', () => {
  it('echoes extra_content unchanged into the next round assistant message', async () => {
    selectCall = 0;
    const signature = { google: { thought_signature: 'signature-123' } };
    const requests: LLMMessage[][] = [];
    vi.mocked(streamChatCompletion).mockImplementation(async function* (messages) {
      requests.push(messages);
      if (requests.length === 1) {
        yield { toolCalls: [{ index: 0, id: 'call-1', name: 'search_document', arguments: '{"doc_id":1,"query":"force majeure","top_k":4}', extra_content: signature }] };
      } else {
        yield { content: '<quote doc="1">The parties agree to comply with this Agreement.</quote>' };
      }
    });

    for await (const event of runAgent({ docIds: [1], message: 'What does the force majeure clause say?' })) {
      // Consume the stream so the second model request is made.
      void event;
    }

    expect(requests).toHaveLength(2);
    const assistant = requests[1].find((message) => message.role === 'assistant');
    expect(assistant?.tool_calls?.[0]).toMatchObject({ id: 'call-1', extra_content: signature });
    expect(assistant?.tool_calls?.[0]?.extra_content).toEqual(signature);
  });
});