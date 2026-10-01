import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import ChatClient from '@/components/chat/ChatClient';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [doc] = await db.select({ id: documents.id, name: documents.name, status: documents.status, page_count: documents.page_count })
    .from(documents).where(eq(documents.id, id));
  if (!doc || doc.status !== 'ready') notFound();
  return <ChatClient document={doc} />;
}