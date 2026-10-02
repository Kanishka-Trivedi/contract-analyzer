import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { comparisons, documents } from '@/lib/db/schema';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid comparison ID' }, { status: 400 });
  const [comparison] = await db.select().from(comparisons).where(eq(comparisons.id, id));
  if (!comparison) return NextResponse.json({ error: 'Comparison not found' }, { status: 404 });
  const [docA] = await db.select({ name: documents.name }).from(documents).where(eq(documents.id, comparison.doc_a_id));
  const [docB] = await db.select({ name: documents.name }).from(documents).where(eq(documents.id, comparison.doc_b_id));
  return NextResponse.json({ ...comparison, doc_a_name: docA?.name, doc_b_name: docB?.name });
}