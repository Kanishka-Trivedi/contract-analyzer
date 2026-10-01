import { NextResponse } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';

export async function GET(request: Request) {
  const docId = new URL(request.url).searchParams.get('docId');
  const condition = docId ? sql`${conversations.doc_ids} @> ${JSON.stringify([Number(docId)])}::jsonb` : undefined;
  const rows = await db.select({ id: conversations.id, title: conversations.title, doc_ids: conversations.doc_ids, createdAt: conversations.createdAt })
    .from(conversations).where(condition).orderBy(desc(conversations.createdAt));
  return NextResponse.json(rows);
}

export async function DELETE(request: Request) {
  const docId = Number(new URL(request.url).searchParams.get('docId'));
  if (!Number.isInteger(docId) || docId <= 0) return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  await db.delete(conversations).where(sql`${conversations.doc_ids} @> ${JSON.stringify([docId])}::jsonb`);
  return NextResponse.json({ success: true });
}