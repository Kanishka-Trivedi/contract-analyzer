import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const docs = await db.select({
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
    }).from(documents).orderBy(desc(documents.createdAt));

    return NextResponse.json(docs.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}
