'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useState } from 'react';

function NewCompareForm() {
  const params = useSearchParams(); const router = useRouter(); const ids = (params.get('docs') || '').split(',').map(Number); const [older, setOlder] = useState(ids[0]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const start = async () => { setBusy(true); const response = await fetch('/api/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docAId: older, docBId: ids.find((id) => id !== older) }) }); const data = await response.json(); if (response.ok) router.push(`/compare/${data.id}`); else setError(data.error || 'Could not start comparison'); setBusy(false); };
  return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6"><h1 className="text-xl font-semibold">Compare versions</h1><p className="mt-2 text-sm text-slate-500">Choose which document is older.</p><div className="mt-5 space-y-2">{ids.map((id) => <label key={id} className="flex items-center gap-2 rounded border p-3"><input type="radio" checked={older === id} onChange={() => setOlder(id)} /> Document {id} {older === id && <span className="text-xs text-slate-400">older</span>}</label>)}</div>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<button disabled={busy} onClick={start} className="mt-5 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Starting...' : 'Compare'}</button></div></main>;
}

export default function NewComparePage() { return <Suspense><NewCompareForm /></Suspense>; }