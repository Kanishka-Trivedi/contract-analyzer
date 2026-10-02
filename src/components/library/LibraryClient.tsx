'use client';
import React, { useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText, Trash2, AlertCircle, CheckCircle2, Clock, Loader2,
  ChevronDown, ChevronUp, RefreshCw, MessagesSquare
} from 'lucide-react';
import Uploader from './Uploader';

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
  ready:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed:     'bg-red-100 text-red-700 border-red-200',
  uploading:  'bg-blue-100 text-blue-700 border-blue-200',
  extracting: 'bg-amber-100 text-amber-700 border-amber-200',
  indexing:   'bg-purple-100 text-purple-700 border-purple-200',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ready:      <CheckCircle2 className="h-3.5 w-3.5" />,
  failed:     <AlertCircle className="h-3.5 w-3.5" />,
  uploading:  <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  extracting: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  indexing:   <Loader2 className="h-3.5 w-3.5 animate-spin" />,
};

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

  const sortedDocs = [...docs].sort((a, b) => {
    let av: any = a[sortField], bv: any = b[sortField];
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? (av ?? 0) - (bv ?? 0) : (bv ?? 0) - (av ?? 0);
  });

  const SortHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <button
      className="flex items-center gap-1 font-semibold uppercase tracking-wide text-xs text-slate-500 hover:text-slate-800"
      onClick={() => { if (sortField === field) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(true); } }}
    >
      {label}
      {sortField === field
        ? sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        : <ChevronDown className="h-3 w-3 opacity-30" />}
    </button>
  );

  const readyDocs = docs.filter(d => d.status === 'ready');

  return (
    <div className="space-y-6">
      <Uploader onUploaded={refresh} />

      {/* Multi-select action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <span className="text-indigo-700 font-medium">{selected.size} selected</span>
          <Link
            href={selected.size === 2 ? `/compare/new?docs=${[...selected].join(',')}` : `/chat/multi?docs=${[...selected].join(',')}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 transition-colors"
          >
            <MessagesSquare className="h-3.5 w-3.5" /> {selected.size === 2 ? 'Compare versions' : `Ask across ${selected.size} documents`}
          </Link>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-slate-500 hover:text-slate-700 text-xs"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Document table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <FileText className="h-12 w-12 mb-4 opacity-40" />
            <p className="text-base font-medium text-slate-500">No documents yet</p>
            <p className="text-sm mt-1">Upload a PDF or DOCX file above to get started.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === docs.length && docs.length > 0}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-4 py-3 text-left"><SortHeader field="name" label="Name" /></th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Pages</th>
                <th className="px-4 py-3 text-left"><SortHeader field="size" label="Size" /></th>
                <th className="px-4 py-3 text-left"><SortHeader field="createdAt" label="Date" /></th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedDocs.map((doc) => (
                <tr
                  key={doc.id}
                  className={`group transition-colors ${selected.has(doc.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(doc.id)}
                      onChange={() => toggleSelect(doc.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      {doc.status === 'ready' ? (
                        <Link
                          href={`/documents/${doc.id}`}
                          className="font-medium text-slate-800 hover:text-indigo-600 transition-colors truncate max-w-[260px]"
                          title={doc.name}
                        >
                          {doc.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-600 truncate max-w-[260px]" title={doc.name}>
                          {doc.name}
                        </span>
                      )}
                    </div>
                    {doc.status_message && doc.status !== 'ready' && (
                      <p className="text-xs text-slate-400 mt-0.5 ml-6">{doc.status_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[doc.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {STATUS_ICONS[doc.status]}
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{doc.page_count ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {doc.size < 1024 * 1024
                      ? `${(doc.size / 1024).toFixed(0)} KB`
                      : `${(doc.size / 1024 / 1024).toFixed(1)} MB`}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {new Date(doc.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {doc.status === 'ready' && (
                        <Link
                          href={`/documents/${doc.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                        >
                          Open
                        </Link>
                      )}
                      {confirmDeleteId === doc.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(doc.id)}
                          disabled={deletingId === doc.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
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
      <div className="flex justify-end">
        <button
          onClick={refresh}
          disabled={isPending}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
    </div>
  );
}
