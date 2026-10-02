'use client';
import React, { useState, useCallback, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText, Trash2, AlertCircle, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, RefreshCw, MessagesSquare
} from 'lucide-react';
import Uploader from './Uploader';
import { EmptyStateIllustration } from '@/components/ui/ClauseProofPrimitives';

type Doc = {
  id: number;
  name: string;
  mime: string;
  size: number;
  status: string;
  progress_pct: number | null;
  status_message: string | null;
  error_code: string | null;
  page_count: number | null;
  createdAt: string;
};

type Props = { initialDocs: Doc[] };

const STATUS_COLORS: Record<string, string> = {
  ready:      'badge-semantic badge-verified',
  failed:     'badge-semantic badge-unverified',
  uploading:  'badge-semantic badge-info',
  extracting: 'badge-semantic badge-info',
  indexing:   'badge-semantic badge-info',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'ready') return <div className="badge-dot dot" />;
  if (status === 'failed') return <div className="badge-dot dot" />;
  return <Loader2 className="h-3 w-3 animate-spin" />;
}

type SortField = 'name' | 'createdAt' | 'size';

function SortHeader({ field, label, sortField, sortAsc, onClick }: { field: SortField; label: string; sortField: SortField; sortAsc: boolean; onClick: () => void }) {
  return (
    <button
      className="flex items-center gap-1 font-semibold tracking-[0.14em] uppercase text-[10px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      onClick={onClick}
    >
      {label}
      {sortField === field
        ? sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        : <ChevronDown className="h-3 w-3 opacity-30" />}
    </button>
  );
}

export default function LibraryClient({ initialDocs }: Props) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<'name' | 'createdAt' | 'size'>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(() => { router.refresh(); });
    // Also refresh docs list via fetch
    fetch('/api/documents').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setDocs(data);
    }).catch(() => {});
  }, [router]);

  const handleDelete = async (id: number) => {
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      setDocs(prev => prev.filter(d => d.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch (_) {}
    setDeletingId(null);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === docs.length) setSelected(new Set());
    else setSelected(new Set(docs.map(d => d.id)));
  };

  const sortedDocs = useMemo(() => [...docs].sort((a, b) => {
    const av = a[sortField]; const bv = b[sortField];
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = typeof av === 'number' ? av : 0;
    const bn = typeof bv === 'number' ? bv : 0;
    return sortAsc ? an - bn : bn - an;
  }), [docs, sortField, sortAsc]);

  const selectedDocs = useMemo(() => docs.filter(d => selected.has(d.id)), [docs, selected]);
  const selectedReady = useMemo(() => selectedDocs.filter(d => d.status === 'ready'), [selectedDocs]);
  // For compare: pick older=earliest createdAt, newer=latest
  const compareIds = useMemo(() => {
    if (selectedReady.length !== 2) return null;
    const sorted = [...selectedReady].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { older: sorted[0].id, newer: sorted[1].id };
  }, [selectedReady]);
  const multiDocIds = useMemo(() => selectedReady.map(d => d.id).join(','), [selectedReady]);

  return (
    <div className="space-y-6">
      <Uploader onUploaded={refresh} />

      {/* Multi-select action bar */}
      {selected.size > 0 && (
        <div className="glass flex items-center gap-3 p-3 rounded-full text-sm sticky top-4 z-50 mb-6 shadow-lg fade-up">
          <span className="text-[var(--text)] font-semibold pl-2">{selected.size} selected</span>
          {/* Compare button — exactly 2 ready docs */}
          {compareIds ? (
            <Link
              href={`/compare/new?docs=${compareIds.older},${compareIds.newer}`}
              className="btn-secondary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
            >
              Compare versions
            </Link>
          ) : (
            <span
              title={selectedReady.length !== 2 ? 'Select exactly 2 ready documents to compare' : ''}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--paper)] text-[var(--muted)] rounded-[var(--radius-btn)] text-xs font-semibold cursor-not-allowed border border-[var(--card-line)] opacity-70"
            >
              Compare versions
            </span>
          )}
          {/* Ask across N docs — 2+ ready docs */}
          {selectedReady.length >= 2 ? (
            <Link
              href={`/documents/${selectedReady[0].id}?docs=${selectedReady.map(d => d.id).join(',')}`}
              className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
            >
              <MessagesSquare className="h-3.5 w-3.5" /> Ask across {selectedReady.length} documents
            </Link>
          ) : (
            <span
              title="Select 2 or more ready documents"
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--paper)] text-[var(--muted)] rounded-[var(--radius-btn)] text-xs font-semibold cursor-not-allowed border border-[var(--card-line)] opacity-70"
            >
              <MessagesSquare className="h-3.5 w-3.5" /> Ask across documents
            </span>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[var(--muted)] hover:text-[var(--text)] text-xs font-medium px-4 transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Document table */}
      <div className="bg-[var(--card)] rounded-[var(--radius-card)] border border-[var(--card-line)] shadow-[var(--shadow-card)] overflow-hidden">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <EmptyStateIllustration />
            <p className="text-base font-semibold text-[var(--text)] mt-6">No documents yet</p>
            <p className="text-sm text-[var(--muted)] mt-1">Upload a PDF or DOCX file above to get started.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-[var(--card-line)]">
            <thead>
              <tr className="bg-[var(--paper)]">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === docs.length && docs.length > 0}
                    onChange={toggleAll}
                    className="rounded border-[var(--card-line)] text-[#8B5CF6] focus:ring-[#8B5CF6]"
                  />
                </th>
                <th className="px-4 py-3 text-left"><SortHeader field="name" label="Name" sortField={sortField} sortAsc={sortAsc} onClick={() => { if (sortField === 'name') setSortAsc(!sortAsc); else { setSortField('name'); setSortAsc(true); } }} /></th>
                <th className="px-4 py-3 text-left font-semibold tracking-[0.14em] uppercase text-[10px] text-[var(--muted)]">Status</th>
                <th className="px-4 py-3 text-left font-semibold tracking-[0.14em] uppercase text-[10px] text-[var(--muted)]">Pages</th>
                <th className="px-4 py-3 text-left"><SortHeader field="size" label="Size" sortField={sortField} sortAsc={sortAsc} onClick={() => { if (sortField === 'size') setSortAsc(!sortAsc); else { setSortField('size'); setSortAsc(true); } }} /></th>
                <th className="px-4 py-3 text-left"><SortHeader field="createdAt" label="Date" sortField={sortField} sortAsc={sortAsc} onClick={() => { if (sortField === 'createdAt') setSortAsc(!sortAsc); else { setSortField('createdAt'); setSortAsc(true); } }} /></th>
                <th className="px-4 py-3 text-right font-semibold tracking-[0.14em] uppercase text-[10px] text-[var(--muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-line)]">
              {sortedDocs.map((doc) => (
                <tr
                  key={doc.id}
                  className={`group transition-colors ${selected.has(doc.id) ? 'bg-[var(--paper)]' : 'hover:bg-[var(--paper)]'}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(doc.id)}
                      onChange={() => toggleSelect(doc.id)}
                      className="rounded border-[var(--card-line)] text-[#8B5CF6] focus:ring-[#8B5CF6]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[var(--gold)] flex-shrink-0" />
                      {doc.status === 'ready' ? (
                        <Link
                          href={`/documents/${doc.id}`}
                          className="font-semibold text-[var(--text)] hover:text-[#8B5CF6] transition-colors truncate max-w-[260px]"
                          title={doc.name}
                        >
                          {doc.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-[var(--muted)] truncate max-w-[260px]" title={doc.name}>
                          {doc.name}
                        </span>
                      )}
                    </div>
                    {doc.status_message && doc.status !== 'ready' && (
                      <p className="text-xs text-[var(--muted)] mt-0.5 ml-6 opacity-80">{doc.status_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_COLORS[doc.status] || 'badge-semantic badge-info'}>
                      <StatusIcon status={doc.status} />
                      <span className="capitalize">{doc.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-[var(--text)] opacity-80">{doc.page_count ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    {doc.size < 1024 * 1024
                      ? `${(doc.size / 1024).toFixed(0)} KB`
                      : `${(doc.size / 1024 / 1024).toFixed(1)} MB`}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    {new Date(doc.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {doc.status === 'ready' && (
                        <Link
                          href={`/documents/${doc.id}`}
                          className="btn-ghost flex items-center justify-center h-8 px-3 text-xs font-semibold"
                        >
                          Open
                        </Link>
                      )}
                      {confirmDeleteId === doc.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="h-8 px-3 rounded-[var(--radius-btn)] bg-[var(--unverified)] text-white text-xs font-semibold hover:bg-opacity-90 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="btn-ghost h-8 px-3 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(doc.id)}
                          disabled={deletingId === doc.id}
                          className="h-8 w-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--unverified)] rounded-[var(--radius-btn)] hover:bg-[var(--sig-critical-soft)] transition-colors disabled:opacity-50"
                          title="Delete document"
                        >
                          {deletingId === doc.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Refresh button */}
      <div className="flex justify-end mt-4">
        <button
          onClick={refresh}
          disabled={isPending}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
    </div>
  );
}
