import { notFound } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import ChatClient from '@/components/chat/ChatClient';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const idStr = (await params).id;
  const ids = idStr.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (ids.length === 0) notFound();
  
  const docs = await db.select({ id: documents.id, name: documents.name, mime: documents.mime, status: documents.status, page_count: documents.page_count })
    .from(documents).where(inArray(documents.id, ids));
    
  if (docs.length !== ids.length || docs.some(d => d.status !== 'ready')) notFound();
  
  return <ChatClient documents={docs} />;
}