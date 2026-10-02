import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { comparisons } from '@/lib/db/schema';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid comparison ID' }, { status: 400 });
  const [comparison] = await db.select().from(comparisons).where(eq(comparisons.id, id));
  if (!comparison) return NextResponse.json({ error: 'Comparison not found' }, { status: 404 });
  return NextResponse.json(comparison);
}