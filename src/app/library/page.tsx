import React from 'react';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import LibraryClient from '@/components/library/LibraryClient';

import { AuroraBackground, LogoMark } from '@/components/ui/ClauseProofPrimitives';
import { ShieldCheck, Sparkles, GitCompare } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  let docs;
  try {
    docs = await db.select({
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
  } catch (error) {
    return (
      <main className="min-h-screen bg-[var(--paper)] flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-xl font-semibold mb-2 text-[var(--text)]">Database Error</h1>
        <p className="text-[var(--muted)] mb-6">Can't reach the database, retry</p>
        <a href="/library" className="bg-[#8B5CF6] text-white rounded-[var(--radius-btn)] px-6 py-2.5 font-semibold hover:opacity-90 transition-opacity">Retry</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <div className="h-[260px] w-full">
        <AuroraBackground>
          <div className="max-w-6xl mx-auto px-6 pt-10 pb-16 fade-up">
            <div className="flex items-center gap-3 mb-6">
              <LogoMark className="h-10 w-10" />
              <span className="text-white font-bold text-xl tracking-tight">ClauseProof</span>
            </div>
            <h1 className="text-4xl text-white tracking-[-0.02em] font-heading font-semibold">
              Every answer, <span className="bg-clip-text text-transparent bg-[var(--aurora)]">proven.</span>
            </h1>
            <p className="text-slate-300 mt-2 max-w-xl text-sm">Upload contracts. Ask anything. Every quote verified by code.</p>
            <div className="flex gap-3 mt-5">
              <div className="glass-dark rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-slate-200"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Verified quotes</div>
              <div className="glass-dark rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-slate-200"><Sparkles className="h-3.5 w-3.5 text-amber-400" /> Citation highlights</div>
              <div className="glass-dark rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-slate-200"><GitCompare className="h-3.5 w-3.5 text-indigo-400" /> Version compare</div>
            </div>
          </div>
        </AuroraBackground>
      </div>
      
      <div className="max-w-6xl mx-auto px-6 -mt-10 relative z-20 pb-16">
        <LibraryClient initialDocs={docs.map(d => ({ ...d, createdAt: d.createdAt.toISOString() }))} />
      </div>
    </main>
  );
}
