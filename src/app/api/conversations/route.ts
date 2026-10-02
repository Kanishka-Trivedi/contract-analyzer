import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db, client } from '@/lib/db';
import { conversations } from '@/lib/db/schema';

export async function GET(request: Request) {
  const docId = new URL(request.url).searchParams.get('docId');
  let rows;
  if (docId) {
    const id = Number(docId);
    // Use raw SQL with jsonb_build_array for proper JSONB containment query
    // Explicitly cast the parameter to integer to help postgres determine type
    const result = await client`SELECT id, title, doc_ids, "created_at" as "createdAt" FROM conversations WHERE "doc_ids" @> jsonb_build_array(${id}::int) ORDER BY "created_at" DESC`;
    rows = result.map(r => ({ id: r.id, title: r.title, doc_ids: r.doc_ids, createdAt: r.createdAt }));
  } else {
    rows = await db.select({ id: conversations.id, title: conversations.title, doc_ids: conversations.doc_ids, createdAt: conversations.createdAt })
      .from(conversations).orderBy(desc(conversations.createdAt));
  }
  return NextResponse.json(rows);
}

export async function DELETE(request: Request) {
  const docId = Number(new URL(request.url).searchParams.get('docId'));
  if (!Number.isInteger(docId) || docId <= 0) return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  await client`DELETE FROM conversations WHERE "doc_ids" @> jsonb_build_array(${docId}::int)`;
  return NextResponse.json({ success: true });
}