import { describe, expect, it, vi } from 'vitest';

const inserted: Record<string, unknown>[] = [];

vi.mock('../../src/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: 1 }]) })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserted.push(value);
        return { returning: vi.fn().mockResolvedValue([{ id: inserted.length }]) };
      }),
    })),
  },
}));

vi.mock('../../src/lib/agent/run', () => ({
  runAgent: async function* () {
    yield { type: 'token', text: 'Partial answer' };
    throw new DOMException('Aborted', 'AbortError');
  },
}));

import { POST } from '../../src/app/api/chat/route';

describe('chat abort persistence', () => {
  it('saves partial assistant text with stopped status', async () => {
    inserted.length = 0;
    const response = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docIds: [1], message: 'Ask a question' }),
    }));
    await response.text();
    const assistant = inserted.find((value) => value.role === 'assistant');
    expect(assistant).toMatchObject({ content: 'Partial answer', status: 'stopped' });
  });
});