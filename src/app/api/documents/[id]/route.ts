import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }
  try {
    await db.delete(documents).where(eq(documents.id, docId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  }
  try {
    const [doc] = await db.select({
      id: documents.id,
      name: documents.name,
      mime: documents.mime,
      size: documents.size,
      status: documents.status,
      progress_pct: documents.progress_pct,
      status_message: documents.status_message,
      error_code: documents.error_code,
      page_count: documents.page_count,
      createdAt: documents.createdAt,
    }).from(documents).where(eq(documents.id, docId));

    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ...doc, createdAt: doc.createdAt.toISOString() });
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}
