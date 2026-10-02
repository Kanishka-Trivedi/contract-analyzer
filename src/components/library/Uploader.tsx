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
        className={`relative p-[2px] cursor-pointer transition-all duration-300 select-none overflow-hidden rounded-[20px] ${
          isDragging
            ? 'scale-[1.01] shadow-[var(--shadow-glow)]'
            : 'hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={`absolute -inset-[100%] opacity-50 bg-[var(--aurora)] ${isDragging ? 'animate-[spin_3s_linear_infinite]' : 'animate-[spin_6s_linear_infinite]'}`} />
        <div className={`relative flex flex-col items-center justify-center p-10 rounded-[18px] transition-colors duration-300 ${isDragging ? 'bg-[#F3F4F6] sm:bg-[#F0F5FF]' : 'bg-[var(--card)]'}`}>
          <UploadCloud className={`mx-auto h-12 w-12 mb-4 text-[#8B5CF6] transition-transform duration-300 ${isDragging ? 'scale-110' : 'scale-100'}`} />
          <p className="text-base font-semibold text-[#0F1530] mb-1">
            {isDragging ? 'Drop to upload' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-sm text-[#5B6486]">PDF or DOCX files, up to 25 MB each. Multiple files supported.</p>
        </div>
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
          {uploads.map((u, i) => (
            <div key={u.docId} className={`glass flex items-center gap-3 p-3 rounded-[16px] text-sm fade-up stagger-${(i % 8) + 1}`}>
              <FileText className="h-5 w-5 flex-shrink-0 text-[var(--gold)]" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--text)] truncate">{u.name}</p>
                <p className={`text-xs mt-0.5 ${u.status === 'failed' ? 'text-[var(--unverified)]' : 'text-[var(--muted)]'}`}>
                  {statusLabel(u)}
                </p>
                {u.status !== 'ready' && u.status !== 'failed' && (
                  <div className="mt-1.5 h-1.5 bg-[var(--card-line)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--aurora)] skeleton rounded-full transition-all duration-500"
                      style={{ width: `${u.progress_pct}%` }}
                    />
                  </div>
                )}
              </div>
              {u.status === 'uploading' || u.status === 'extracting' || u.status === 'indexing'
                ? <Loader2 className="h-4 w-4 text-[var(--info)] animate-spin flex-shrink-0" />
                : u.status === 'ready'
                ? <CheckCircle2 className="h-4 w-4 text-[var(--verified)] flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 text-[var(--unverified)] flex-shrink-0" />
              }
              {(u.status === 'ready' || u.status === 'failed') && (
                <button
                  onClick={(e) => { e.stopPropagation(); dismissUpload(u.docId); }}
                  className="flex-shrink-0 text-[var(--muted)] hover:text-[var(--text)]"
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
