import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockConversationId = 42;
  const mockDocId = 16;
  const clientQuery = vi.fn();

  const mockConversation = {
    id: mockConversationId,
    kind: 'single',
    doc_ids: [mockDocId],
    title: 'Test message',
    created_at: new Date('2026-01-01T00:00:00Z'),
  };
  const mockMessages = [
    { id: 1, conversation_id: mockConversationId, role: 'user', content: 'Test question' },
    { id: 2, conversation_id: mockConversationId, role: 'assistant', content: 'Test answer' },
  ];

  const mockSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  const mockDb = {
    select: vi.fn(() => mockSelectChain),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: mockConversationId }]),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };

  return { clientQuery, mockDb, mockSelectChain, mockConversation, mockMessages, mockConversationId, mockDocId };
});

vi.mock('../../src/lib/db', () => ({
  db: mocks.mockDb,
  client: mocks.clientQuery,
}));

vi.mock('../../src/lib/agent/run', () => ({
  runAgent: vi.fn().mockResolvedValue([]),
}));

import { GET as getConversationsByDoc, DELETE as deleteConversationsByDoc } from '../../src/app/api/conversations/route';
import { GET as getConversation, DELETE as deleteConversation } from '../../src/app/api/conversations/[id]/route';

if (!process.env.DATABASE_URL) console.log('Skipping live database tests because DATABASE_URL is missing');
describe.skipIf(!process.env.DATABASE_URL)('conversation lifecycle API', () => {
  it('lists conversations by docId using raw SQL', async () => {
    mocks.clientQuery.mockResolvedValue([
      { id: mocks.mockConversationId, title: 'Test message', doc_ids: [mocks.mockDocId], createdAt: mocks.mockConversation.created_at },
    ]);

    const response = await getConversationsByDoc(new Request(`http://localhost/api/conversations?docId=${mocks.mockDocId}`));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(mocks.mockConversationId);
    expect(data[0].doc_ids).toEqual([mocks.mockDocId]);
  });

  it('fetches a conversation with its messages by ID', async () => {
    mocks.mockSelectChain.where = vi.fn().mockResolvedValueOnce([mocks.mockConversation]).mockResolvedValueOnce(mocks.mockMessages);
    mocks.mockDb.select.mockReturnValue(mocks.mockSelectChain);

    const response = await getConversation(new Request('http://localhost'), { params: Promise.resolve({ id: String(mocks.mockConversationId) }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.conversation.id).toBe(mocks.mockConversationId);
    expect(data.messages).toHaveLength(2);
  });

  it('deletes a conversation by ID', async () => {
    const response = await deleteConversation(new Request('http://localhost'), { params: Promise.resolve({ id: String(mocks.mockConversationId) }) });
    expect(response.status).toBe(200);
  });

  it('deletes all conversations for a document', async () => {
    mocks.clientQuery.mockResolvedValue([]);

    const response = await deleteConversationsByDoc(new Request(`http://localhost/api/conversations?docId=${mocks.mockDocId}`));
    expect(response.status).toBe(200);
    expect(mocks.clientQuery).toHaveBeenCalled();
  });
});
