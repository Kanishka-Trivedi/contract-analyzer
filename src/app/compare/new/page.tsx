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
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">Compare versions</h1>
        <p className="mt-2 text-sm text-slate-500">The document with the earliest date is pre-selected as the older version. You can swap them.</p>
        <div className="mt-5 space-y-2">
          {ids.map(id => (
            <label key={id} className={`flex items-center gap-3 rounded border p-3 cursor-pointer ${older === id ? 'border-indigo-400 bg-indigo-50' : ''}`}>
              <input type="radio" name="older" checked={older === id} onChange={() => setOlder(id)} />
              <span className="flex-1 text-sm font-medium truncate">{getName(id)}</span>
              {older === id && <span className="text-xs text-indigo-600 font-semibold">Older (A)</span>}
              {newer === id && older !== null && <span className="text-xs text-emerald-600 font-semibold">Newer (B)</span>}
            </label>
          ))}
        </div>
        {older !== null && newer !== undefined && (
          <p className="mt-3 text-xs text-slate-500">
            Will compare: <span className="text-red-600 font-medium">{getName(older)}</span> → <span className="text-emerald-600 font-medium">{getName(newer)}</span>
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button disabled={busy || older === null} onClick={start} className="mt-5 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Starting...' : 'Compare'}
        </button>
      </div>
    </main>
  );
}

export default function NewComparePage() { return <Suspense><NewCompareForm /></Suspense>; }