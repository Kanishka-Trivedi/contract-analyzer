import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue([]);
  const deleteTable = vi.fn(() => ({ where }));
  const clientQuery = vi.fn().mockResolvedValue([]);
  return { where, deleteTable, clientQuery };
});

vi.mock('../../src/lib/db', () => ({
  db: { delete: mocks.deleteTable },
  client: mocks.clientQuery,
}));

import { DELETE as deleteConversation } from '../../src/app/api/conversations/[id]/route';
import { DELETE as deleteDocumentChats } from '../../src/app/api/conversations/route';

if (!process.env.DATABASE_URL) console.log('Skipping live database tests because DATABASE_URL is missing');
describe.skipIf(!process.env.DATABASE_URL)('conversation deletion APIs', () => {
  it('deletes one conversation, allowing the FK cascade to remove messages', async () => {
    const response = await deleteConversation(new Request('http://localhost'), { params: Promise.resolve({ id: '42' }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteTable).toHaveBeenCalled();
    expect(mocks.where).toHaveBeenCalled();
  });

  it('deletes all conversations selected for a document', async () => {
    const response = await deleteDocumentChats(new Request('http://localhost/api/conversations?docId=16'));
    expect(response.status).toBe(200);
    expect(mocks.clientQuery).toHaveBeenCalledTimes(1);
  });
});