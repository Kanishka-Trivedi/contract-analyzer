'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, FileText, CheckCircle, Loader2, AlertCircle, Plus, Minus, Edit2, ArrowLeftRight, CheckCircle2 } from 'lucide-react';

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

const SIG_COLORS: Record<string, string> = { critical: 'text-rose-600', high: 'text-orange-600', medium: 'text-amber-600', low: 'text-slate-500', cosmetic: 'text-slate-400' };
const SIG_BG: Record<string, string> = { critical: 'bg-rose-100', high: 'bg-orange-100', medium: 'bg-amber-100', low: 'bg-slate-100', cosmetic: 'bg-slate-100' };
const SIG_BORDER: Record<string, string> = { critical: 'border-rose-500', high: 'border-orange-500', medium: 'border-amber-500', low: 'border-slate-300', cosmetic: 'border-slate-200' };
const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, cosmetic: 4 };

function DocumentHeader({ title, olderName, newerName }: { title: string; olderName: string; newerName: string }) {
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
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-full bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 text-rose-200 text-xs font-semibold">
            <FileText className="h-3.5 w-3.5" /> {olderName}
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-emerald-200 text-xs font-semibold">
            <FileText className="h-3.5 w-3.5" /> {newerName}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompareClient({ id }: { id: number }) {
  const [data, setData] = useState<CompareData | null>(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('significance');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const load = () => fetch(`/api/compare/${id}`).then(r => r.json()).then(setData);
    load();
    const timer = setInterval(() => { if (data?.status !== 'complete' && data?.status !== 'error') load(); }, 1500);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data?.status]);

  useEffect(() => {
    if (!data || data.status === 'complete' || data.status === 'error') return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [data?.status]);

  const changes = useMemo(() => {
    const list = (data?.changes_json || []) as Change[];
    return list
      .filter(c => filter === 'all' || c.significance === filter || c.type === filter)
      .sort((a, b) => sort === 'significance' ? order[a.significance] - order[b.significance] : 0);
  }, [data, filter, sort]);

  const summaryBullets = useMemo(() => (data?.summary_json || []).map(s => s.replace(/^(CRITICAL|HIGH|MEDIUM|LOW|COSMETIC):\s*/i, '')), [data]);

  const olderName = data?.doc_a_name || `Document ${data?.doc_a_id || 'A'}`;
  const newerName = data?.doc_b_name || `Document ${data?.doc_b_id || 'B'}`;

  if (!data || (data.status !== 'complete' && data.status !== 'error')) {
    const steps = ['Reading both documents', 'Aligning clauses', 'Analysing changes', 'Writing the summary'];
    const p = data?.progress_pct || 0;
    const currentStep = p < 25 ? 0 : p < 50 ? 1 : p < 90 ? 2 : 3;
    
    return (
      <main className="min-h-screen bg-[#F6F7FC] text-[var(--text)] font-sans">
        <DocumentHeader title="Comparing your documents" olderName={olderName} newerName={newerName} />
        <div className="mx-auto max-w-[1200px] px-6 -mt-14 relative z-20 pb-16">
          <div className="rounded-[20px] bg-white p-8 shadow-[var(--shadow-card)] border border-[var(--card-line)] max-w-xl mx-auto">
            <div className="space-y-6">
              {steps.map((step, idx) => (
                <div key={step} className="flex items-center gap-4">
                  {idx < currentStep ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  ) : idx === currentStep ? (
                    <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                  ) : (
                    <div className="h-6 w-6 rounded-full border-2 border-[var(--card-line)]" />
                  )}
                  <div className={`text-sm font-semibold ${idx <= currentStep ? 'text-slate-900' : 'text-slate-400'}`}>
                    {step} {idx === 2 && currentStep === 2 && `(Working)`}
                  </div>
                </div>
              ))}
              <div className="mt-8 pt-6 border-t border-[var(--card-line)]">
                <div className="flex justify-between text-xs font-semibold text-slate-500 mb-2">
                  <span>Overall progress</span>
                  <span className="font-mono">{p}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--aurora)] transition-all duration-1000" style={{ width: `${p}%` }} />
                </div>
                <p className="text-xs text-[var(--muted)] mt-3 text-center">Elapsed: {elapsed}s</p>
                {elapsed > 60 && <p className="text-xs text-amber-600 mt-2 text-center font-medium">This is taking longer than usual.</p>}
              </div>
            </div>
          </div>
          <div className="mt-8 space-y-4 max-w-4xl mx-auto">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-[20px] bg-white p-6 border border-[var(--card-line)] opacity-50">
                <div className="h-4 w-1/3 bg-slate-200 rounded animate-pulse mb-4" />
                <div className="h-4 w-1/4 bg-slate-200 rounded animate-pulse mb-8" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-20 bg-slate-100 rounded animate-pulse" />
                  <div className="h-20 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (data.status === 'error') {
    return (
      <main className="min-h-screen bg-[#F6F7FC] text-[var(--text)] font-sans">
        <DocumentHeader title="Comparison failed" olderName={olderName} newerName={newerName} />
        <div className="mx-auto max-w-xl px-6 -mt-14 relative z-20 pb-16">
          <div className="rounded-[20px] bg-rose-50 border border-rose-200 p-8 text-center shadow-[var(--shadow-card)]">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
            <h2 className="text-xl font-semibold text-rose-900 mb-2">Something went wrong</h2>
            <p className="text-rose-700 text-sm mb-6">Could not complete the analysis. Please try again.</p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/library" className="btn-primary px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white border-0">Back to library</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const allChanges = (data.changes_json || []) as Change[];
  if (allChanges.length === 0) {
    return (
      <main className="min-h-screen bg-[#F6F7FC] text-[var(--text)] font-sans">
        <DocumentHeader title="No differences found" olderName={olderName} newerName={newerName} />
        <div className="mx-auto max-w-xl px-6 -mt-14 relative z-20 pb-16">
          <div className="rounded-[20px] bg-white border border-[var(--card-line)] p-10 text-center shadow-[var(--shadow-card)]">
            <CheckCircle className="mx-auto h-16 w-16 text-emerald-500 mb-6" />
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">These documents are identical in substance</h2>
            <p className="text-slate-500 text-sm mb-8">We found no meaningful legal or semantic differences between the two versions.</p>
            <Link href="/library" className="btn-primary inline-flex items-center justify-center">Back to library</Link>
          </div>
        </div>
      </main>
    );
  }

  const criticalHigh = allChanges.filter(c => c.significance === 'critical' || c.significance === 'high').length;
  const mediumLow = allChanges.filter(c => c.significance === 'medium' || c.significance === 'low').length;
  const cosmetic = allChanges.filter(c => c.significance === 'cosmetic').length;

  return (
    <main className="min-h-screen bg-[#F6F7FC] text-[var(--text)] font-sans">
      <DocumentHeader title="What changed?" olderName={olderName} newerName={newerName} />
      
      <div className="mx-auto max-w-[1200px] px-6 -mt-14 relative z-20 pb-16">
        {/* SUMMARY STRIP */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded-[20px] shadow-[var(--shadow-card)] border border-[var(--card-line)] p-5 border-t-[3px] border-t-slate-400">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted)] mb-2">Total changes</div>
            <div className="text-3xl font-heading font-semibold text-slate-900">{allChanges.length}</div>
          </div>
          <div className="bg-white rounded-[20px] shadow-[var(--shadow-card)] border border-[var(--card-line)] p-5 border-t-[3px] border-t-rose-500">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted)] mb-2">Critical & High</div>
            <div className="text-3xl font-heading font-semibold text-rose-600">{criticalHigh}</div>
          </div>
          <div className="bg-white rounded-[20px] shadow-[var(--shadow-card)] border border-[var(--card-line)] p-5 border-t-[3px] border-t-amber-500">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted)] mb-2">Medium & Low</div>
            <div className="text-3xl font-heading font-semibold text-amber-600">{mediumLow}</div>
          </div>
          <div className="bg-white rounded-[20px] shadow-[var(--shadow-card)] border border-[var(--card-line)] p-5 border-t-[3px] border-t-slate-300">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted)] mb-2">Cosmetic</div>
            <div className="text-3xl font-heading font-semibold text-slate-500">{cosmetic}</div>
          </div>
        </div>

        <div className="bg-white rounded-[20px] shadow-[var(--shadow-card)] border border-[var(--card-line)] p-4 mb-8">
          <div className="h-2 w-full flex rounded-full overflow-hidden">
            <div className="bg-rose-500 transition-all duration-1000" style={{ width: `${(allChanges.filter(c => c.significance === 'critical').length / allChanges.length) * 100}%` }} />
            <div className="bg-orange-500 transition-all duration-1000" style={{ width: `${(allChanges.filter(c => c.significance === 'high').length / allChanges.length) * 100}%` }} />
            <div className="bg-amber-500 transition-all duration-1000" style={{ width: `${(allChanges.filter(c => c.significance === 'medium').length / allChanges.length) * 100}%` }} />
            <div className="bg-slate-400 transition-all duration-1000" style={{ width: `${(allChanges.filter(c => c.significance === 'low').length / allChanges.length) * 100}%` }} />
            <div className="bg-slate-200 transition-all duration-1000" style={{ width: `${(cosmetic / allChanges.length) * 100}%` }} />
          </div>
        </div>

        {summaryBullets.length > 0 && (
          <div className="bg-white rounded-[20px] shadow-[var(--shadow-card)] border border-[var(--card-line)] p-6 md:p-8 mb-8">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-900 mb-6">Key changes</h2>
            <ul className="space-y-4">
              {summaryBullets.map((item, i) => (
                <li key={i} className={`flex gap-3 text-[15px] text-slate-700 font-medium fade-up stagger-${(i%8)+1}`}>
                  <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0 mt-2" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* STICKY CONTROL BAR */}
        <div className="sticky top-3 z-30 mb-8 rounded-[20px] glass-dark bg-white/80 backdrop-blur-md border border-[var(--card-line)] p-3 shadow-[var(--shadow-card)] flex flex-wrap items-center gap-2">
          <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-[var(--card-line)] hover:bg-slate-50 text-[var(--muted)] hover:text-[var(--text)]'}`}>All</button>
          {['critical', 'high', 'medium', 'low', 'cosmetic', 'added', 'removed', 'modified'].map(value => {
            const count = allChanges.filter(c => c.significance === value || c.type === value).length;
            if (!count) return null;
            return (
              <button key={value} onClick={() => setFilter(value)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${filter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-[var(--card-line)] hover:bg-slate-50 text-[var(--muted)] hover:text-[var(--text)]'}`}>
                {['critical', 'high', 'medium', 'low', 'cosmetic'].includes(value) && <div className={`h-1.5 w-1.5 rounded-full ${filter === value ? 'bg-white/80' : SIG_BG[value].replace('100', '500')}`} />}
                <span className="capitalize">{value}</span>
                <span className={`text-[10px] ${filter === value ? 'text-indigo-200' : 'text-[var(--muted)]'}`}>{count}</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-3">
            {filter !== 'all' && (
              <div className="flex items-center gap-3 hidden md:flex">
                <span className="text-xs font-medium text-slate-500">Showing {changes.length} of {allChanges.length}</span>
                <button onClick={() => setFilter('all')} className="btn-ghost px-2 py-1 text-xs">Clear filters</button>
              </div>
            )}
            <select value={sort} onChange={e => setSort(e.target.value)} className="rounded-full border border-[var(--card-line)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 cursor-pointer">
              <option value="significance">Sort: Significance</option>
              <option value="document">Sort: Document order</option>
            </select>
          </div>
        </div>

        {/* CHANGE CARDS */}
        <div className="space-y-6 max-w-4xl mx-auto">
          {changes.map((change, i) => {
            const isRemoved = change.type === 'removed';
            const isAdded = change.type === 'added';
            return (
              <article key={change.id} className={`group rounded-[20px] border border-[var(--card-line)] bg-white shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:shadow-lg transition-all border-l-4 ${SIG_BORDER[change.significance] || 'border-slate-200'} fade-up stagger-${(i<8 ? i+1 : 0)}`}>
                <div className="p-6">
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold tracking-[0.14em] uppercase mb-3">
                    <span className="flex items-center gap-1 text-slate-600">
                      {change.type === 'added' && <Plus className="h-3 w-3 text-emerald-500" />}
                      {change.type === 'removed' && <Minus className="h-3 w-3 text-rose-500" />}
                      {change.type === 'modified' && <Edit2 className="h-3 w-3 text-indigo-500" />}
                      {change.type === 'moved' && <ArrowLeftRight className="h-3 w-3 text-amber-500" />}
                      {change.type}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span className={`flex items-center gap-1.5 ${SIG_COLORS[change.significance]}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${SIG_BG[change.significance].replace('100', '500')}`} />
                      {change.significance}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span className="text-[var(--muted)]">{change.category}</span>
                    <span className="ml-auto font-mono text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-[var(--radius-sm)]">{change.id || 'N/A'}</span>
                  </div>

                  {change.aiError ? (
                    <div className="mt-4 flex items-center gap-3 bg-amber-50 text-amber-800 p-3 rounded-lg text-sm border border-amber-200/50">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">AI summary unavailable</span>
                    </div>
                  ) : (
                    <h2 className="text-[17px] font-semibold text-slate-900 leading-snug font-sans">{change.summary}</h2>
                  )}

                  {change.numeric && change.numeric.length > 0 && (
                    <div className="mt-4 bg-[var(--gold-soft)] rounded-xl p-3 inline-flex flex-col gap-2 border border-[var(--gold)]/20">
                      {change.numeric.map(n => (
                        <div key={`${n.old}-${n.new}`} className="flex items-center gap-3 text-sm font-mono font-medium">
                          <span className="text-rose-600 line-through decoration-rose-300">{n.old}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-[var(--gold)]" />
                          <span className="text-emerald-700 font-bold">{n.new}</span>
                          {n.kind && <span className="text-[10px] font-sans tracking-[0.1em] uppercase text-[var(--gold)] ml-2">{n.kind}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {!isAdded && (
                      <div className={isRemoved ? 'md:col-span-2' : ''}>
                        <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-rose-600 uppercase">Older: v1</p>
                        <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 h-full min-h-[100px]">
                          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-800">{change.oldText}</pre>
                        </div>
                      </div>
                    )}
                    {isAdded && (
                      <div className="rounded-xl border-2 border-dashed border-[var(--card-line)] bg-slate-50 flex items-center justify-center min-h-[100px]">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Not present in v1</span>
                      </div>
                    )}

                    {!isRemoved && (
                      <div className={isAdded ? 'md:col-span-2' : ''}>
                        <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-emerald-600 uppercase">Newer: v2</p>
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 h-full min-h-[100px]">
                          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-800">{change.newText}</pre>
                        </div>
                      </div>
                    )}
                    {isRemoved && (
                      <div className="rounded-xl border-2 border-dashed border-[var(--card-line)] bg-slate-50 flex items-center justify-center min-h-[100px]">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Removed in v2</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-[var(--card-line)] flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost px-3 py-1.5 text-slate-500 hover:text-[#8B5CF6]">Open in older</button>
                      <button className="btn-ghost px-3 py-1.5 text-slate-500 hover:text-[#8B5CF6]">Open in newer</button>
                    </div>
                    {change.oldPage && change.newPage && (
                      <span className="text-slate-400 font-medium">Pages {change.oldPage} / {change.newPage}</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}