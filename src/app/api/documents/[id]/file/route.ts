import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const docId = parseInt((await params).id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
  const [doc] = await db.select({ file_bytes: documents.file_bytes, mime: documents.mime, name: documents.name })
    .from(documents).where(eq(documents.id, docId));
  if (!doc?.file_bytes) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  const bytes = Buffer.from(doc.file_bytes);
  const headers = new Headers({
    'Content-Type': doc.mime,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `inline; filename="${doc.name.replace(/[\r\n"]/g, '')}"`,
  });
  const range = req.headers.get('range');
  if (!range) {
    headers.set('Content-Length', String(bytes.length));
    return new Response(bytes, { status: 200, headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2] || 0));
  const end = match[2] ? Number(match[2]) : bytes.length - 1;
  if (start > end || start >= bytes.length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
  const boundedEnd = Math.min(end, bytes.length - 1);
  const body = bytes.subarray(start, boundedEnd + 1);
  headers.set('Content-Length', String(body.length));
  headers.set('Content-Range', `bytes ${start}-${boundedEnd}/${bytes.length}`);
  return new Response(body, { status: 206, headers });
}