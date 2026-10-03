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
  
  let fetchedDocs;
  try {
    fetchedDocs = await db.select({ id: documents.id, name: documents.name, mime: documents.mime, status: documents.status, page_count: documents.page_count })
      .from(documents).where(inArray(documents.id, ids));
  } catch (error) {
    return (
      <main className="h-dvh flex flex-col items-center justify-center bg-[var(--paper)] p-8 text-center">
        <h1 className="text-xl font-semibold mb-2 text-[var(--text)]">Database Error</h1>
        <p className="text-[var(--muted)] mb-6">Can't reach the database, retry</p>
        <a href={`/documents/${idStr}${docsStr ? `?docs=${docsStr}` : ''}`} className="bg-[#4F46E5] text-white rounded-[var(--radius-btn)] px-6 py-2.5 font-semibold hover:opacity-90 transition-opacity">Retry</a>
      </main>
    );
  }
    
  const validDocs = fetchedDocs.filter(d => d.status === 'ready');
  if (!validDocs.some(d => d.id === firstId)) notFound();
  
  return (
    <div className="h-dvh overflow-hidden flex flex-col">
      <ChatClient documents={validDocs} />
    </div>
  );
}