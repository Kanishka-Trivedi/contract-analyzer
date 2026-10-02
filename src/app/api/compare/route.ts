import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { comparisons, documents } from '@/lib/db/schema';
import { runComparison } from '@/lib/compare/run';

export async function POST(request: Request) {
  const body = await request.json() as { docAId?: number; docBId?: number };
  if (!body.docAId || !body.docBId || body.docAId === body.docBId) return NextResponse.json({ error: 'Choose two different documents' }, { status: 400 });
  const docs = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, body.docAId), eq(documents.status, 'ready')));
  const [other] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, body.docBId), eq(documents.status, 'ready')));
  if (docs.length !== 1 || !other) return NextResponse.json({ error: 'Documents must be ready' }, { status: 400 });
  const [comparison] = await db.insert(comparisons).values({ doc_a_id: body.docAId, doc_b_id: body.docBId, status: 'pending', progress_pct: 0 }).returning({ id: comparisons.id });
  void runComparison(comparison.id, body.docAId, body.docBId);
  return NextResponse.json({ id: comparison.id }, { status: 202 });
}