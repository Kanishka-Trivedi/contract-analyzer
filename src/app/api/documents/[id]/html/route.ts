import { eq } from 'drizzle-orm';
import mammoth from 'mammoth';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';

export const runtime = 'nodejs';

const cache = new Map<number, string>();

function sanitizeHtml(html: string) {
  return html
    .replace(/<\/?(script|style|iframe|object|embed|form)[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*(\2)/gi, '$1="#"');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const docId = parseInt((await params).id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  const cached = cache.get(docId);
  if (cached) return new Response(cached, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  const [doc] = await db.select({ file_bytes: documents.file_bytes, mime: documents.mime }).from(documents).where(eq(documents.id, docId));
  if (!doc?.file_bytes || !doc.mime.includes('word')) return NextResponse.json({ error: 'DOCX file not found' }, { status: 404 });
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(doc.file_bytes) });
  const html = sanitizeHtml(result.value);
  cache.set(docId, html);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}