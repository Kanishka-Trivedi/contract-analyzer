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
const SIG_COLORS: Record<string, string> = { critical: 'bg-[var(--sig-critical-soft)] text-[var(--sig-critical)]', high: 'bg-[var(--sig-high-soft)] text-[var(--sig-high)]', medium: 'bg-[var(--sig-medium-soft)] text-[var(--sig-medium)]', low: 'bg-[var(--sig-low-soft)] text-[var(--sig-low)]', cosmetic: 'bg-[var(--card-line)] text-[var(--muted)]' };

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
      <main className="min-h-screen bg-[var(--paper)] p-8 flex items-center justify-center">
        <div className="mx-auto max-w-xl w-full rounded-[var(--radius-card)] border border-[var(--card-line)] bg-[var(--card)] p-8 shadow-[var(--shadow-card)] text-center fade-up">
          <h1 className="text-2xl font-semibold font-heading tracking-tight">Document comparison</h1>
          <p className="mt-4 text-sm font-medium text-[var(--muted)]">
            {data?.status === 'error' ? 'Comparison failed. Retry from the library.' : `${data?.status === 'pending' ? 'Preparing' : 'Analysing changes'} ${data?.progress_pct || 0}%`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--paper)] p-8 text-[var(--text)]">
      <div className="mx-auto max-w-6xl fade-up">
        <h1 className="text-3xl font-semibold font-heading tracking-tight">Document comparison</h1>
        <p className="mt-2 text-sm text-[var(--muted)] flex items-center gap-2">
          <span className="font-semibold tracking-[0.14em] uppercase text-[10px]">Older</span> <span className="font-semibold text-[var(--unverified)]">{olderName}</span>
          <span className="text-[var(--card-line)]">→</span>
          <span className="font-semibold tracking-[0.14em] uppercase text-[10px]">Newer</span> <span className="font-semibold text-[var(--verified)]">{newerName}</span>
        </p>

        {summaryBullets.length > 0 && (
          <ul className="my-8 list-disc space-y-2 pl-5 text-sm text-[var(--text)] font-medium max-w-3xl leading-[1.6]">
            {summaryBullets.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        )}

        <div className="mb-6 flex flex-wrap gap-2 items-center">
          <button onClick={() => setFilter('all')} className={`rounded-[var(--radius-chip)] px-4 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase transition-colors ${filter === 'all' ? 'bg-[#8B5CF6] text-white shadow-[var(--shadow-glow)]' : 'bg-[var(--card-line)] text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]'}`}>All</button>
          {['critical', 'high', 'medium', 'low', 'cosmetic', 'added', 'removed', 'modified'].map(value => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-[var(--radius-chip)] px-4 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase transition-colors ${filter === value ? 'bg-[#8B5CF6] text-white shadow-[var(--shadow-glow)]' : 'bg-[#8B5CF6]/10 text-[#8B5CF6] hover:bg-[#8B5CF6]/20'}`}>{value}</button>
          ))}
          <select value={sort} onChange={e => setSort(e.target.value)} className="ml-auto rounded-[var(--radius-btn)] border border-[var(--card-line)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] outline-none focus:border-[#8B5CF6]">
            <option value="significance">Sort: Significance</option>
            <option value="document">Sort: Document order</option>
          </select>
        </div>

        <div className="space-y-6">
          {changes.map((change, i) => (
            <article key={change.id} className={`rounded-[var(--radius-card)] border border-[var(--card-line)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)] stagger-${(i%5)+1}`}>
              <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.14em] uppercase">
                <span className="rounded-[var(--radius-chip)] bg-[var(--card-line)] px-2.5 py-1 text-[var(--muted)]">{change.type}</span>
                <span className={`rounded-[var(--radius-chip)] px-2.5 py-1 ${SIG_COLORS[change.significance] || 'bg-[var(--card-line)] text-[var(--muted)]'}`}>{change.significance}</span>
                <span className="text-[var(--muted)]">{change.category}</span>
              </div>
              {change.aiError ? (
                <div className="mt-4 flex items-center gap-3">
                  <p className="text-sm text-[var(--muted)] italic">AI summary unavailable</p>
                  <button
                    disabled={retrying.has(change.id)}
                    onClick={() => {
                      setRetrying(prev => new Set([...prev, change.id]));
                      setTimeout(() => setRetrying(prev => { const s = new Set(prev); s.delete(change.id); return s; }), 2000);
                    }}
                    className="text-xs font-semibold text-[#8B5CF6] hover:underline disabled:opacity-50"
                  >
                    {retrying.has(change.id) ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              ) : (
                <h2 className="mt-4 text-lg font-semibold text-[var(--text)] leading-snug">{change.summary}</h2>
              )}
              {change.numeric?.map(n => (
                <p key={`${n.old}-${n.new}`} className="mt-3 inline-block rounded-[var(--radius-md)] bg-[var(--sig-medium-soft)] px-3 py-1.5 text-sm font-mono font-medium text-[var(--sig-medium)]">
                  {n.old} → {n.new}
                </p>
              ))}
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-[var(--unverified)] uppercase">Older ({olderName})</p>
                  <div className="rounded-[var(--radius-md)] bg-red-50/50 border border-red-100/50 p-4 min-h-[80px]">
                    <pre className={`whitespace-pre-wrap font-serif text-[16px] leading-[1.6] ${change.oldText ? 'text-red-900 line-through' : 'text-red-400 italic font-sans text-sm'}`}>{change.oldText || 'Not present'}</pre>
                  </div>
                  {change.oldPage && <p className="mt-2 text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Page {change.oldPage}</p>}
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-[var(--verified)] uppercase">Newer ({newerName})</p>
                  <div className="rounded-[var(--radius-md)] bg-emerald-50/50 border border-emerald-100/50 p-4 min-h-[80px]">
                    <pre className={`whitespace-pre-wrap font-serif text-[16px] leading-[1.6] ${change.newText ? 'text-emerald-900' : 'text-emerald-500 italic font-sans text-sm'}`}>{change.newText || 'Not present'}</pre>
                  </div>
                  {change.newPage && <p className="mt-2 text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--muted)]">Page {change.newPage}</p>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}