import { notFound } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import ChatClient from '@/components/chat/ChatClient';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ docs?: string }> }) {
  const idStr = decodeURIComponent((await params).id);
  const docsStr = (await searchParams).docs || '';
  const rawIds = `${idStr},${docsStr}`.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
  const ids = Array.from(new Set(rawIds));
  
  if (ids.length === 0) notFound();
  const firstId = ids[0];
  
  const fetchedDocs = await db.select({ id: documents.id, name: documents.name, mime: documents.mime, status: documents.status, page_count: documents.page_count })
    .from(documents).where(inArray(documents.id, ids));
    
  const validDocs = fetchedDocs.filter(d => d.status === 'ready');
  if (!validDocs.some(d => d.id === firstId)) notFound();
  
  return (
    <div className="h-dvh overflow-hidden flex flex-col">
      <ChatClient documents={validDocs} />
    </div>
  );
}