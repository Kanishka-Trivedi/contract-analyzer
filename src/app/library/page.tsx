import React from 'react';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import LibraryClient from '@/components/library/LibraryClient';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
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

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Document Library</h1>
          <p className="text-slate-500 mt-1 text-sm">Upload PDF or DOCX contracts to analyse them with AI.</p>
        </div>
        <LibraryClient initialDocs={docs.map(d => ({ ...d, createdAt: d.createdAt.toISOString() }))} />
      </div>
    </main>
  );
}
