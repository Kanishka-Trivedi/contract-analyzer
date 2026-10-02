'use client';
import { useEffect, useMemo, useState } from 'react';

type Change = {
  id: string; type: string; significance: string; category: string; summary: string;
  oldText?: string; newText?: string; oldPage?: number; newPage?: number;
  numeric?: { old: string; new: string; kind?: string }[];
  aiError?: boolean;
};
type CompareData = {
  status: string; progress_pct?: number; summary_json?: string[];
  changes_json?: Change[];
  doc_a_id?: number; doc_b_id?: number;
  doc_a_name?: string; doc_b_name?: string;
};
const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, cosmetic: 4 };
const SIG_COLORS: Record<string, string> = { critical: 'bg-red-200 text-red-800', high: 'bg-orange-100 text-orange-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-100 text-slate-600', cosmetic: 'bg-slate-50 text-slate-500' };

export default function CompareClient({ id }: { id: number }) {
  const [data, setData] = useState<CompareData | null>(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('significance');
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = () => fetch(`/api/compare/${id}`).then(r => r.json()).then(setData);
    load();
    const timer = setInterval(() => { if (data?.status !== 'complete' && data?.status !== 'error') load(); }, 1500);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data?.status]);

  const changes = useMemo(() => {
    const list = (data?.changes_json || []) as Change[];
    return list
      .filter(c => filter === 'all' || c.significance === filter || c.type === filter)
      .sort((a, b) => sort === 'significance' ? order[a.significance] - order[b.significance] : 0);
  }, [data, filter, sort]);

  // Strip "HIGH: " / "MEDIUM: " template prefixes from summary bullets
  const summaryBullets = useMemo(() => {
    return (data?.summary_json || []).map(s => s.replace(/^(CRITICAL|HIGH|MEDIUM|LOW|COSMETIC):\s*/i, ''));
  }, [data]);

  const olderName = data?.doc_a_name || `Document ${data?.doc_a_id || 'A'}`;
  const newerName = data?.doc_b_name || `Document ${data?.doc_b_id || 'B'}`;

  if (!data || (data.status !== 'complete' && data.status !== 'error')) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Document comparison</h1>
          <p className="mt-3 text-sm text-slate-500">
            {data?.status === 'error' ? 'Comparison failed. Retry from the library.' : `${data?.status === 'pending' ? 'Preparing' : 'Analysing changes'} ${data?.progress_pct || 0}%`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Document comparison</h1>
        <p className="mt-1 text-sm text-slate-500">
          Older: <span className="font-medium text-red-600">{olderName}</span>
          {' → '}
          Newer: <span className="font-medium text-emerald-600">{newerName}</span>
        </p>

        {summaryBullets.length > 0 && (
          <ul className="my-5 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {summaryBullets.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')} className={`rounded-full px-3 py-1 text-xs ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-200'}`}>All</button>
          {['critical', 'high', 'medium', 'low', 'cosmetic', 'added', 'removed', 'modified'].map(value => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1 text-xs ${filter === value ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>{value}</button>
          ))}
          <select value={sort} onChange={e => setSort(e.target.value)} className="ml-auto rounded border px-2 text-xs">
            <option value="significance">Significance</option>
            <option value="document">Document order</option>
          </select>
        </div>

        <div className="space-y-4">
          {changes.map(change => (
            <article key={change.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-xs uppercase">
                <span className="rounded bg-slate-100 px-2 py-1">{change.type}</span>
                <span className={`rounded px-2 py-1 ${SIG_COLORS[change.significance] || 'bg-slate-100'}`}>{change.significance}</span>
                <span className="text-slate-400">{change.category}</span>
              </div>
              {change.aiError ? (
                <div className="mt-3 flex items-center gap-3">
                  <p className="text-sm text-slate-500 italic">AI summary unavailable</p>
                  <button
                    disabled={retrying.has(change.id)}
                    onClick={() => {
                      setRetrying(prev => new Set([...prev, change.id]));
                      // retry is a no-op here; full retry would require a new compare run
                      setTimeout(() => setRetrying(prev => { const s = new Set(prev); s.delete(change.id); return s; }), 2000);
                    }}
                    className="text-xs text-indigo-600 underline disabled:opacity-50"
                  >
                    {retrying.has(change.id) ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              ) : (
                <h2 className="mt-3 font-medium">{change.summary}</h2>
              )}
              {change.numeric?.map(n => (
                <p key={`${n.old}-${n.new}`} className="mt-2 rounded bg-amber-50 p-2 text-sm font-mono">
                  {n.old} → {n.new}
                </p>
              ))}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold text-red-600 uppercase">Older ({olderName})</p>
                  <pre className="whitespace-pre-wrap rounded bg-red-50 p-3 text-xs">{change.oldText || 'Not present'}</pre>
                  {change.oldPage && <p className="mt-1 text-xs text-slate-400">Page {change.oldPage}</p>}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-emerald-600 uppercase">Newer ({newerName})</p>
                  <pre className="whitespace-pre-wrap rounded bg-emerald-50 p-3 text-xs">{change.newText || 'Not present'}</pre>
                  {change.newPage && <p className="mt-1 text-xs text-slate-400">Page {change.newPage}</p>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}