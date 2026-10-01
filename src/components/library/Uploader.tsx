'use client';
import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, AlertCircle, CheckCircle2, Loader2, X, RefreshCw } from 'lucide-react';

type DocStatus = {
  docId: number;
  name: string;
  status: 'uploading' | 'extracting' | 'indexing' | 'ready' | 'failed';
  progress_pct: number;
  status_message?: string;
  error_code?: string;
};

type Props = {
  onUploaded: () => void;
};

export default function Uploader({ onUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<DocStatus[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseRefs = useRef<Record<number, EventSource>>({});

  const updateUpload = useCallback((docId: number, patch: Partial<DocStatus>) => {
    setUploads(prev => prev.map(u => u.docId === docId ? { ...u, ...patch } : u));
  }, []);

  const startSSE = useCallback((docId: number) => {
    if (sseRefs.current[docId]) {
      sseRefs.current[docId].close();
    }
    const es = new EventSource(`/api/documents/${docId}/status`);
    sseRefs.current[docId] = es;

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        updateUpload(docId, {
          status: data.status,
          progress_pct: data.progress_pct ?? 0,
          status_message: data.status_message,
          error_code: data.error_code,
        });
        if (data.status === 'ready' || data.status === 'failed') {
          es.close();
          delete sseRefs.current[docId];
          if (data.status === 'ready') onUploaded();
        }
      } catch (_) {}
    };
    es.onerror = () => {
      es.close();
      delete sseRefs.current[docId];
    };
  }, [updateUpload, onUploaded]);

  const uploadFile = useCallback(async (file: File) => {
    // Client-side pre-check for extension
    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
    if (ext !== '.pdf' && ext !== '.docx') {
      setError(`Only PDF and DOCX files are supported. You uploaded a ${ext || '(unknown)'}`);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError(`File "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 25 MB.`);
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const tempId = Date.now(); // temporary ID before we get real docId
    setUploads(prev => [...prev, {
      docId: tempId,
      name: file.name,
      status: 'uploading',
      progress_pct: 0,
      status_message: 'Uploading...',
    }]);

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploads(prev => prev.filter(u => u.docId !== tempId));
        setError(data.error || 'Upload failed');
        return;
      }
      // Replace temp entry with real docId
      setUploads(prev => prev.map(u =>
        u.docId === tempId ? { ...u, docId: data.docId, status: 'extracting' } : u
      ));
      startSSE(data.docId);
    } catch (err) {
      setUploads(prev => prev.filter(u => u.docId !== tempId));
      setError('Network error. Please try again.');
    }
  }, [startSSE]);

  const handleFiles = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }
  };

  const dismissUpload = (docId: number) => {
    sseRefs.current[docId]?.close();
    delete sseRefs.current[docId];
    setUploads(prev => prev.filter(u => u.docId !== docId));
  };

  const statusLabel = (u: DocStatus) => {
    if (u.status === 'failed') return u.status_message || 'Processing failed';
    if (u.status === 'ready') return 'Ready';
    return u.status_message || u.status;
  };

  return (
    <div className="mb-8">
      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 select-none ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
            : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-3" />
        <p className="text-base font-semibold text-slate-700 mb-1">Drag &amp; drop or click to upload</p>
        <p className="text-sm text-slate-500">PDF or DOCX files, up to 25 MB each. Multiple files supported.</p>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-3 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Upload progress items */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploads.map((u) => (
            <div key={u.docId} className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-colors ${
              u.status === 'ready' ? 'bg-green-50 border-green-200' :
              u.status === 'failed' ? 'bg-red-50 border-red-200' :
              'bg-slate-50 border-slate-200'
            }`}>
              <FileText className="h-5 w-5 flex-shrink-0 text-slate-400" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{u.name}</p>
                <p className={`text-xs mt-0.5 ${u.status === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>
                  {statusLabel(u)}
                </p>
                {u.status !== 'ready' && u.status !== 'failed' && (
                  <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${u.progress_pct}%` }}
                    />
                  </div>
                )}
              </div>
              {u.status === 'uploading' || u.status === 'extracting' || u.status === 'indexing'
                ? <Loader2 className="h-4 w-4 text-indigo-500 animate-spin flex-shrink-0" />
                : u.status === 'ready'
                ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              }
              {(u.status === 'ready' || u.status === 'failed') && (
                <button
                  onClick={(e) => { e.stopPropagation(); dismissUpload(u.docId); }}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
