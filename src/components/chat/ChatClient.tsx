'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, MessageSquare, MoreHorizontal, Send, Square, Sparkles, Trash2 } from 'lucide-react';
import DocumentViewer, { DocumentViewerHandle, ViewerQuote } from '@/components/viewer/DocumentViewer';

type Quote = ViewerQuote & { status: 'verified' | 'partial' | 'unverified'; reason?: string };
type Coverage = { sections_total: number; sections_read: number; pages_total: number; pages_read: number; complete: boolean };
type ChatMessage = { id?: number; role: 'user' | 'assistant'; content: string; status?: string; quotes?: Quote[]; coverage?: Coverage; trace?: { type: string; name?: string; summary?: string; args_summary?: string }[]; quotes_json?: Quote[]; coverage_json?: Coverage; tool_trace_json?: ChatMessage['trace'] };
type Conversation = { id: number; title: string | null; createdAt: string };

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

function answerParts(content: string) {
  const parts: Array<{ text: string; quote?: boolean }> = [];
  const regex = /<quote(?:\s+doc=['"]?[^'">\s]+['"]?)?\s*>([\s\S]*?)(?:<\/quote>|$)/g;
  let last = 0;
  let match;
  while ((match = regex.exec(content))) {
    if (match.index > last) parts.push({ text: content.slice(last, match.index) });
    parts.push({ text: match[2], quote: true });
    last = regex.lastIndex;
  }
  if (last < content.length) parts.push({ text: content.slice(last).replace(/<\/?quote[^>]*>/g, '') });
  return parts;
}

function QuoteCards({ quotes, onOpen }: { quotes: Quote[]; onOpen: (quote: Quote, index: number) => void }) {
  const [showUnverified, setShowUnverified] = useState(false);
  const verified = quotes.filter((quote) => quote.status !== 'unverified');
  const unverified = quotes.filter((quote) => quote.status === 'unverified');
  return <div className="mt-4 space-y-2">
    {verified.map((quote, index) => <div key={`${quote.text}-${index}`} className={`border-l-4 p-3 text-sm ${quote.status === 'verified' ? 'border-emerald-500 bg-emerald-50' : 'border-amber-400 bg-amber-50'}`}>
      <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wide">
        <span className={quote.status === 'verified' ? 'text-emerald-700' : 'text-amber-700'}>{quote.status === 'verified' ? 'Verified' : 'Close match'}</span>
        <span className="text-slate-500">Page {quote.occurrences[0]?.pageFrom || 1}{quote.occurrences[0]?.pageTo && quote.occurrences[0].pageTo !== quote.occurrences[0].pageFrom ? `-${quote.occurrences[0].pageTo}` : ''}</span>
      </div>
      <p className="mt-1 text-slate-700">{quote.status === 'partial' ? quote.matchedText || quote.text : quote.text}</p>
      <button onClick={() => onOpen(quote, 0)} className="mt-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900">Open in document</button>
    </div>)}
    {unverified.length > 0 && <div className="border border-red-200 bg-red-50">
      <button onClick={() => setShowUnverified(!showUnverified)} className="w-full px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-red-700">{showUnverified ? 'Hide' : 'Show'} Unverified ({unverified.length})</button>
      {showUnverified && <div className="space-y-2 border-t border-red-200 p-3">{unverified.map((quote, index) => <div key={`${quote.text}-${index}`}><p className="text-sm text-red-700 line-through">{quote.text}</p><p className="text-xs text-red-600">Could not be verified in the document</p></div>)}</div>}
    </div>}
  </div>;
}

export default function ChatClient({ document }: { document: { id: number; name: string; mime: string; page_count: number | null } }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<number | undefined>(undefined);
  const generationRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const viewerRef = useRef<DocumentViewerHandle | null>(null);
  const [viewerWidth, setViewerWidth] = useState(380);
  const [viewerCollapsed, setViewerCollapsed] = useState(false);
  const [mobileViewerOpen, setMobileViewerOpen] = useState(false);
  const viewerNotice = useCallback((message: string) => setNotice(message), []);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const isAtLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useEffect(() => {
    fetch(`/api/conversations?docId=${document.id}`).then((response) => response.json()).then(setConversations).catch(() => setError('Could not load chat history.')).finally(() => setLoadingHistory(false));
  }, [document.id]);

  useEffect(() => {
    if (!isAtLatestRef.current) return;
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming]);

  const openConversation = async (id: number) => {
    abortRef.current?.abort();
    generationRef.current += 1;
    conversationIdRef.current = id;
    setStreaming(false);
    setError('');
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return setError('Could not open that conversation.');
    const data = await response.json();
    setConversationId(id);
    router.replace(`/documents/${document.id}?chat=${id}`);
    setMessages(data.messages.filter((message: ChatMessage) => message.role === 'user' || message.role === 'assistant').map((message: ChatMessage) => ({ ...message, quotes: message.quotes_json || [], coverage: message.coverage_json, trace: message.tool_trace_json || [] })));
  };

  const deleteConversation = async (conversation: Conversation) => {
    if (!window.confirm("Delete this chat? This can't be undone.")) return;
    const previous = conversations;
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    const wasActive = conversationIdRef.current === conversation.id;
    if (wasActive) newChat();
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      setNotice('Chat deleted.');
    } catch {
      setConversations(previous);
      setError('Could not delete that chat. It has been restored.');
    }
  };

  const deleteAllConversations = async () => {
    if (!conversations.length || !window.confirm("Delete all chats for this document? This can't be undone.")) return;
    const previous = conversations;
    setConversations([]);
    newChat();
    try {
      const response = await fetch(`/api/conversations?docId=${document.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      setNotice('All chats deleted.');
    } catch {
      setConversations(previous);
      setError('Could not delete all chats. They have been restored.');
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || streaming) return;
    const requestGeneration = generationRef.current;
    const requestConversationId = conversationIdRef.current;
    setInput(''); setError(''); setNotice(''); setStreaming(true);
    setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: '', trace: [] }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: requestConversationId, docIds: [document.id], message }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error((await response.json()).error || 'Chat request failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const apply = (event: Record<string, unknown>) => setMessages((current) => {
        if (generationRef.current !== requestGeneration) return current;
        const next = [...current]; const last = next[next.length - 1];
        if (!last || last.role !== 'assistant') return current;
        if (event.type === 'token') last.content += String(event.text || '');
        if (event.type === 'tool_start' || event.type === 'tool_result') last.trace = [...(last.trace || []), event as ChatMessage['trace'] extends Array<infer T> ? T : never];
        if (event.type === 'quotes') last.quotes = event.items as Quote[];
        if (event.type === 'coverage') last.coverage = event.coverage as Coverage;
        if (event.type === 'done') { last.quotes = event.quotes as Quote[]; last.coverage = event.coverage as Coverage; last.trace = event.tool_trace as ChatMessage['trace']; }
        if (event.type === 'stopped') last.status = 'stopped';
        return next;
      });
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) if (line.trim()) { const event = JSON.parse(line) as Record<string, unknown>; if (event.type === 'error') setError(String(event.message)); apply(event); }
      }
      const historyResponse = await fetch(`/api/conversations?docId=${document.id}`);
      const refreshedConversations = historyResponse.ok ? await historyResponse.json() as Conversation[] : [];
      if (generationRef.current !== requestGeneration) return;
      if (historyResponse.ok) setConversations(refreshedConversations);
      if (!requestConversationId) {
        const latest = refreshedConversations[0];
        if (latest) {
          conversationIdRef.current = latest.id;
          setConversationId(latest.id);
          router.replace(`/documents/${document.id}?chat=${latest.id}`);
        }
      }
    } catch (caught) {
      if ((caught as Error).name === 'AbortError') setNotice('Stopped. Your partial answer was saved.');
      else setError(caught instanceof Error ? caught.message : 'Chat request failed');
    } finally {
      if (generationRef.current === requestGeneration) {
        setStreaming(false);
        abortRef.current = null;
      }
    }
  };

  const stop = () => abortRef.current?.abort();
  const newChat = () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    conversationIdRef.current = undefined;
    setConversationId(undefined);
    setMessages([]);
    setStreaming(false);
    setError('');
    router.replace(`/documents/${document.id}?chat=new`);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openCitation = (quote: Quote, occurrenceIndex: number) => viewerRef.current?.openCitation(quote, occurrenceIndex);
  const handleMessageScroll = () => {
    const list = messageListRef.current;
    if (!list) return;
    const atLatest = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    isAtLatestRef.current = atLatest;
    setShowJumpToLatest(!atLatest && messages.length > 0);
  };
  const jumpToLatest = () => {
    isAtLatestRef.current = true;
    setShowJumpToLatest(false);
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
  };

  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900">
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5">
      <Link href="/library" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Back to library"><ArrowLeft className="h-5 w-5" /></Link>
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{document.name}</p><p className="text-xs text-slate-500">{document.page_count || 0} pages · Contract analysis</p></div>
      <div className="ml-auto flex items-center gap-2 text-xs text-slate-500"><button onClick={() => setMobileViewerOpen(true)} className="rounded-md border border-slate-200 px-2 py-1 text-xs lg:hidden">Viewer</button><Sparkles className="h-4 w-4 text-indigo-600" /> Evidence-first assistant</div>
    </header>
    <div className="flex min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[240px_minmax(0,1fr)_var(--viewer-width)]" style={{ '--viewer-width': viewerCollapsed ? '28px' : `${viewerWidth}px` } as React.CSSProperties}>
      <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r"><button onClick={newChat} className="mb-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><MessageSquare className="h-4 w-4" /> New chat</button><div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recent chats</div>{conversations.length > 0 && <details className="relative"><summary className="list-none cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100" title="Chat actions"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 z-10 mt-1 w-52 rounded-md border border-slate-200 bg-white p-1 shadow-lg"><button onClick={deleteAllConversations} className="w-full rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50">Delete all chats for this document</button></div></details>}</div>{loadingHistory ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : conversations.length === 0 ? <p className="text-sm text-slate-400">No conversations yet.</p> : <div className="space-y-1">{conversations.map((conversation) => <div key={conversation.id} className={`group flex items-center gap-1 rounded-md ${conversationId === conversation.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}><button onClick={() => openConversation(conversation.id)} className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${conversationId === conversation.id ? 'text-indigo-700' : 'text-slate-600'}`}><span className="block truncate">{conversation.title || 'Untitled chat'}</span><span className="block text-[11px] text-slate-400">{relativeTime(conversation.createdAt)}</span></button><button onClick={() => deleteConversation(conversation)} className="mr-1 rounded p-2 text-slate-400 opacity-100 hover:bg-red-50 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100" title="Delete chat" aria-label={`Delete ${conversation.title || 'chat'}`}><Trash2 className="h-4 w-4" /></button></div>)}</div>}</aside>
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={messageListRef} onScroll={handleMessageScroll} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-10">{messages.length === 0 ? <div className="mx-auto max-w-2xl pt-12"><div className="mb-8"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Ask the contract</p><h1 className="text-3xl font-semibold tracking-tight">Find the clause, then prove it.</h1><p className="mt-3 text-slate-500">Answers are grounded in exact document text and checked before they reach you.</p></div><div className="grid gap-2 sm:grid-cols-3">{['What does the force majeure clause say?', 'What are the termination rights?', 'Summarise the payment obligations.'].map((question) => <button key={question} onClick={() => setInput(question)} className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-700">{question}</button>)}</div></div> : messages.map((message, index) => <article key={`${message.id || index}-${message.role}`} className={message.role === 'user' ? 'ml-auto max-w-2xl' : 'max-w-3xl'}><div className={message.role === 'user' ? 'rounded-xl bg-indigo-600 px-4 py-3 text-sm text-white' : 'rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm'}>{message.role === 'assistant' && message.trace && message.trace.length > 0 && <details className="mb-3 text-xs text-slate-500" open={streaming && index === messages.length - 1}><summary className="cursor-pointer font-semibold">Research activity ({message.trace.length})</summary><div className="mt-2 space-y-1 border-l border-slate-200 pl-3">{message.trace.map((item, traceIndex) => <p key={traceIndex}>{item.type === 'tool_start' ? item.args_summary : item.summary}</p>)}</div></details>}<div className="whitespace-pre-wrap leading-7">{answerParts(message.content).map((part, partIndex) => part.quote ? <span key={partIndex} className="rounded bg-emerald-100 px-1 text-emerald-900">{part.text}</span> : <span key={partIndex}>{part.text}</span>)}</div>{message.status === 'stopped' && <span className="mt-3 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Stopped</span>}{message.role === 'assistant' && message.coverage && !message.coverage.complete && message.coverage.sections_total > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Searched {message.coverage.sections_read} of {message.coverage.sections_total} sections</div>}{message.role === 'assistant' && message.quotes && message.quotes.length === 0 && !streaming && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">No verified quotes support this answer</div>}{message.role === 'assistant' && message.quotes && message.quotes.length > 0 && !streaming && <QuoteCards quotes={message.quotes} onOpen={openCitation} />}</div></article>)}</div>{showJumpToLatest && <button onClick={jumpToLatest} className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow">Jump to latest</button>}
        {notice && <div className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-center text-xs text-amber-800">{notice}</div>}{error && <div className="flex items-center justify-between border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700"><span>{error}</span><button onClick={() => setError('')} className="font-semibold">Dismiss</button></div>}
        <form onSubmit={send} className="border-t border-slate-200 bg-white p-4 md:px-10"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-indigo-400"> <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event); } }} placeholder="Ask about this contract..." rows={1} className="min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm outline-none" /><button type={streaming ? 'button' : 'submit'} onClick={streaming ? stop : undefined} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white ${streaming ? 'bg-slate-700 hover:bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{streaming ? <><Square className="h-4 w-4" /> Stop</> : <><Send className="h-4 w-4" /> Send</>}</button></div></form>
      </section>
      <div className={`${mobileViewerOpen ? 'fixed inset-0 z-40 block' : 'hidden'} bg-black/20 lg:relative lg:inset-auto lg:z-auto lg:block`} onClick={() => mobileViewerOpen && setMobileViewerOpen(false)}><div className="h-full w-full lg:h-full" onClick={(event) => event.stopPropagation()}><DocumentViewer ref={viewerRef} initialDoc={document} width={viewerWidth} collapsed={viewerCollapsed} onWidthChange={setViewerWidth} onCollapse={setViewerCollapsed} onNotice={viewerNotice} /></div></div>
    </div>
  </main>;
}