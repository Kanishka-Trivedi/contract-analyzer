'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

type DocInfo = { id: number; name: string; createdAt: string };

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
        // Default: older = document with earliest createdAt
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

  const getName = (id: number) => docInfos.find(d => d.id === id)?.name || `Document ${id}`;
  const newer = ids.find(id => id !== older);

  return (
    <main className="min-h-screen bg-[var(--paper)] p-8 flex items-center justify-center fade-up">
      <div className="mx-auto max-w-lg w-full rounded-[var(--radius-card)] border border-[var(--card-line)] bg-[var(--card)] p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-2xl font-semibold font-heading tracking-tight text-[var(--text)]">Compare versions</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">The document with the earliest date is pre-selected as the older version. You can swap them.</p>
        <div className="mt-6 space-y-3">
          {ids.map(id => (
            <label key={id} className={`flex items-center gap-3 rounded-[var(--radius-md)] border p-4 cursor-pointer transition-colors ${older === id ? 'border-[#8B5CF6] bg-[#8B5CF6]/5' : 'border-[var(--card-line)] hover:border-[#8B5CF6]/30'}`}>
              <input type="radio" name="older" checked={older === id} onChange={() => setOlder(id)} className="accent-[#8B5CF6]" />
              <span className="flex-1 text-sm font-semibold truncate text-[var(--text)]">{getName(id)}</span>
              {older === id && <span className="text-[10px] tracking-[0.14em] uppercase text-[#8B5CF6] font-bold">Older (A)</span>}
              {newer === id && older !== null && <span className="text-[10px] tracking-[0.14em] uppercase text-[var(--verified)] font-bold">Newer (B)</span>}
            </label>
          ))}
        </div>
        {older !== null && newer !== undefined && (
          <p className="mt-4 text-xs font-semibold text-[var(--muted)] flex items-center gap-2">
            <span className="uppercase tracking-[0.14em] text-[10px]">Will compare:</span>
            <span className="text-[var(--unverified)]">{getName(older)}</span>
            <span className="text-[var(--card-line)]">→</span>
            <span className="text-[var(--verified)]">{getName(newer)}</span>
          </p>
        )}
        {error && <p className="mt-4 text-sm font-semibold text-[var(--unverified)]">{error}</p>}
        <button disabled={busy || older === null} onClick={start} className="btn-primary mt-6 w-full disabled:opacity-50">
          {busy ? 'Starting...' : 'Compare'}
        </button>
      </div>
    </main>
  );
}

export default function NewComparePage() { return <Suspense><NewCompareForm /></Suspense>; }