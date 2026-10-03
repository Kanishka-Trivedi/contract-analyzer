'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, FileText, ArrowLeftRight, Loader2 } from 'lucide-react';

type DocInfo = { id: number; name: string; createdAt: string; size?: number };

function DocumentHeader({ title }: { title: string }) {
  return (
    <div className="relative overflow-hidden bg-[#0B1020] px-6 pt-8 pb-24">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-100" />
      <div className="absolute -top-[20%] -left-[10%] h-[50%] w-[40%] rounded-full bg-indigo-500/20 blur-[120px] mix-blend-screen" />
      <div className="absolute -bottom-[20%] -right-[10%] h-[50%] w-[40%] rounded-full bg-cyan-500/20 blur-[120px] mix-blend-screen" />
      
      <div className="mx-auto max-w-[1200px] relative z-10">
        <Link href="/library" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Library
        </Link>
        <div className="text-[10px] tracking-[0.14em] uppercase font-bold text-indigo-400 mb-2">VERSION COMPARISON</div>
        <h1 className="text-4xl text-white font-heading font-semibold mb-6">{title}</h1>
      </div>
    </div>
  );
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function NewCompareForm() {
  const params = useSearchParams();
  const router = useRouter();
  const ids = (params.get('docs') || '').split(',').map(Number).filter(Boolean);
  const [docInfos, setDocInfos] = useState<DocInfo[]>([]);
  const [older, setOlder] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all(ids.map(id => fetch(`/api/documents/${id}`).then(r => r.json())))
      .then((results: DocInfo[]) => {
        setDocInfos(results);
        const sorted = [...results].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (sorted[0]) setOlder(sorted[0].id);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!older) return;
    const newer = ids.find(id => id !== older);
    if (!newer) return;
    setBusy(true);
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docAId: older, docBId: newer }),
    });
    const data = await response.json();
    if (response.ok) router.push(`/compare/${data.id}`);
    else setError(data.error || 'Could not start comparison');
    setBusy(false);
  };

  const olderDoc = docInfos.find(d => d.id === older);
  const newerId = ids.find(id => id !== older);
  const newerDoc = docInfos.find(d => d.id === newerId);

  return (
    <main className="min-h-screen bg-[#F6F7FC] text-[var(--text)] font-sans">
      <DocumentHeader title="Compare two versions" />
      <div className="mx-auto max-w-4xl px-6 -mt-14 relative z-20 pb-16">
        <div className="rounded-[20px] bg-white p-8 shadow-[var(--shadow-card)] border border-[var(--card-line)]">
          <div className="flex flex-col md:flex-row items-stretch gap-4 mb-8">
            <div className="flex-1 rounded-[16px] border border-rose-200 bg-rose-50/30 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mb-3">Older (A)</div>
              {olderDoc ? (
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0 rounded-lg bg-rose-100 p-2 text-rose-600"><FileText className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{olderDoc.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>{new Date(olderDoc.createdAt).toLocaleDateString()}</span>
                      {olderDoc.size && <><span>&middot;</span><span>{formatSize(olderDoc.size)}</span></>}
                    </p>
                  </div>
                </div>
              ) : <div className="h-10 animate-pulse bg-rose-100/50 rounded-lg" />}
            </div>
            
            <div className="flex items-center justify-center -mx-2 z-10 md:mx-0">
              <button 
                onClick={() => setOlder(newerId!)}
                disabled={!newerId}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-indigo-200 hover:text-indigo-600 transition-all text-slate-400"
                title="Swap versions"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 rounded-[16px] border border-emerald-200 bg-emerald-50/30 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-3">Newer (B)</div>
              {newerDoc ? (
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0 rounded-lg bg-emerald-100 p-2 text-emerald-600"><FileText className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{newerDoc.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>{new Date(newerDoc.createdAt).toLocaleDateString()}</span>
                      {newerDoc.size && <><span>&middot;</span><span>{formatSize(newerDoc.size)}</span></>}
                    </p>
                  </div>
                </div>
              ) : <div className="h-10 animate-pulse bg-emerald-100/50 rounded-lg" />}
            </div>
          </div>

          <div className="border-t border-[var(--card-line)] pt-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 text-center">Will compare</p>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
              {olderDoc && (
                <div className="flex items-center gap-2 rounded-full bg-rose-50 border border-rose-200 px-3 py-1.5 text-rose-700 text-xs font-semibold">
                  <FileText className="h-3.5 w-3.5" /> {olderDoc.name}
                </div>
              )}
              {olderDoc && newerDoc && <ArrowRight className="h-4 w-4 text-slate-300" />}
              {newerDoc && (
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-emerald-700 text-xs font-semibold">
                  <FileText className="h-3.5 w-3.5" /> {newerDoc.name}
                </div>
              )}
            </div>

            {error && <p className="mb-4 text-center text-sm font-medium text-rose-600">{error}</p>}
            
            <button 
              disabled={busy || !older || !newerId} 
              onClick={start} 
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4338CA] transition-all disabled:opacity-50"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</> : 'Start comparison'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function NewComparePage() { return <Suspense><NewCompareForm /></Suspense>; }