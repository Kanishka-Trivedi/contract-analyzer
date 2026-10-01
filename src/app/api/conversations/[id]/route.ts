import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const rows = await db.select().from(messages).where(eq(messages.conversation_id, id));
  return NextResponse.json({ conversation, messages: rows });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  await db.delete(conversations).where(eq(conversations.id, id));
  return NextResponse.json({ success: true });
}