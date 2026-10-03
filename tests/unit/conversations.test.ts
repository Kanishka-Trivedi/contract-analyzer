import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { GET as listConversations } from '@/app/api/conversations/route';
import { GET as getConversation, DELETE as deleteConversation } from '@/app/api/conversations/[id]/route';

if (!process.env.DATABASE_URL) console.log('Skipping live database tests because DATABASE_URL is missing');
describe.skipIf(!process.env.DATABASE_URL)('Conversations API', () => {
  it('creates, lists, fetches and deletes a conversation', async () => {
    // 1. Create a conversation
    const docIds = [9999];
    const [conversation] = await db.insert(conversations).values({
      kind: 'single',
      doc_ids: docIds,
      title: 'Test conversation',
    }).returning();
    
    expect(conversation).toBeDefined();
    
    // Create a message
    await db.insert(messages).values({
      conversation_id: conversation.id,
      role: 'user',
      content: 'Hello',
    });

    // 2. List by docId
    const reqList = new Request(`http://localhost/api/conversations?docId=${docIds[0]}`);
    const resList = await listConversations(reqList);
    const listed = await resList.json();
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: conversation.id })
      ])
    );

    // 3. Fetch it
    const reqGet = new Request(`http://localhost/api/conversations/${conversation.id}`);
    const resGet = await getConversation(reqGet, { params: Promise.resolve({ id: String(conversation.id) }) });
    const fetched = await resGet.json();
    expect(fetched.conversation.id).toBe(conversation.id);
    expect(fetched.messages.length).toBe(1);

    // 4. Delete it
    const reqDel = new Request(`http://localhost/api/conversations/${conversation.id}`);
    const resDel = await deleteConversation(reqDel, { params: Promise.resolve({ id: String(conversation.id) }) });
    const deleted = await resDel.json();
    expect(deleted.success).toBe(true);

    // Verify deletion
    const resGetAfter = await getConversation(reqGet, { params: Promise.resolve({ id: String(conversation.id) }) });
    expect(resGetAfter.status).toBe(404);
  });
});
