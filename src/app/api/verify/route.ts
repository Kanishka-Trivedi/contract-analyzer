import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents, pages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyQuote, DocRef } from '@/lib/verification/verifyQuote';

export async function POST(req: Request) {
  try {
    const { docId, quote } = await req.json();
    if (!docId || typeof quote !== 'string') {
      return NextResponse.json({ error: 'Missing docId or quote' }, { status: 400 });
    }

    const [doc] = await db.select().from(documents).where(eq(documents.id, parseInt(docId, 10)));
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.norm_text || !doc.norm_map || !doc.full_text) {
      return NextResponse.json({ error: 'Document not fully processed for verification' }, { status: 400 });
    }

    const docPages = await db.select().from(pages).where(eq(pages.doc_id, doc.id)).orderBy(pages.page_no);

    const docRef: DocRef = {
      id: doc.id,
      fullText: doc.full_text,
      normText: doc.norm_text,
      map: doc.norm_map as number[],
      pages: docPages.map(p => ({
        pageNo: p.page_no,
        start: p.start_offset,
        end: p.end_offset
      }))
    };

    const result = verifyQuote(docRef, quote);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
