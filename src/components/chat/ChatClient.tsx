'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Loader2, MessageSquare, PanelRight, Send, Square, Sparkles } from 'lucide-react';

type Quote = { text: string; status: 'verified' | 'partial' | 'unverified'; matchedText?: string; reason?: string; occurrences: { pageFrom: number; pageTo: number }[] };
type Coverage = { sections_total: number; sections_read: number; pages_total: number; pages_read: number; complete: boolean };
type ChatMessage = { id?: number; role: 'user' | 'assistant'; content: string; status?: string; quotes?: Quote[]; coverage?: Coverage; trace?: { type: string; name?: string; summary?: string; args_summary?: string }[]; quotes_json?: Quote[]; coverage_json?: Coverage; tool_trace_json?: ChatMessage['trace'] };
type Conversation = { id: number; title: string | null; createdAt: string };

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

function QuoteCards({ quotes, onOpen }: { quotes: Quote[]; onOpen: () => void }) {
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
      <button onClick={onOpen} className="mt-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900">Open in document</button>
    </div>)}
    {unverified.length > 0 && <div className="border border-red-200 bg-red-50">
      <button onClick={() => setShowUnverified(!showUnverified)} className="w-full px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-red-700">{showUnverified ? 'Hide' : 'Show'} Unverified ({unverified.length})</button>
      {showUnverified && <div className="space-y-2 border-t border-red-200 p-3">{unverified.map((quote, index) => <div key={`${quote.text}-${index}`}><p className="text-sm text-red-700 line-through">{quote.text}</p><p className="text-xs text-red-600">Could not be verified in the document</p></div>)}</div>}
    </div>}
  </div>;
}

export default function ChatClient({ document }: { document: { id: number; name: string; page_count: number | null } }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`/api/conversations?docId=${document.id}`).then((response) => response.json()).then(setConversations).catch(() => setError('Could not load chat history.')).finally(() => setLoadingHistory(false));
  }, [document.id]);

  const openConversation = async (id: number) => {
    setError('');
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return setError('Could not open that conversation.');
    const data = await response.json();
    setConversationId(id);
    setMessages(data.messages.filter((message: ChatMessage) => message.role === 'user' || message.role === 'assistant').map((message: ChatMessage) => ({ ...message, quotes: message.quotes_json || [], coverage: message.coverage_json, trace: message.tool_trace_json || [] })));
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || streaming) return;
    setInput(''); setError(''); setNotice(''); setStreaming(true);
    setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: '', trace: [] }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, docIds: [document.id], message }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error((await response.json()).error || 'Chat request failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const apply = (event: Record<string, unknown>) => setMessages((current) => {
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
      if (historyResponse.ok) setConversations(refreshedConversations);
      if (!conversationId) {
        const latest = refreshedConversations[0];
        if (latest) setConversationId(latest.id);
      }
    } catch (caught) {
      if ((caught as Error).name === 'AbortError') setNotice('Stopped. Your partial answer was saved.');
      else setError(caught instanceof Error ? caught.message : 'Chat request failed');
    } finally { setStreaming(false); abortRef.current = null; }
  };

  const stop = () => abortRef.current?.abort();
  const newChat = () => { setConversationId(undefined); setMessages([]); setError(''); };

  return <main className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-5">
      <Link href="/library" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Back to library"><ArrowLeft className="h-5 w-5" /></Link>
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{document.name}</p><p className="text-xs text-slate-500">{document.page_count || 0} pages · Contract analysis</p></div>
      <div className="ml-auto flex items-center gap-2 text-xs text-slate-500"><Sparkles className="h-4 w-4 text-indigo-600" /> Evidence-first assistant</div>
    </header>
    <div className="grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)_280px]">
      <aside className="border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r"><button onClick={newChat} className="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><MessageSquare className="h-4 w-4" /> New chat</button><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent chats</div>{loadingHistory ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : conversations.length === 0 ? <p className="text-sm text-slate-400">No conversations yet.</p> : <div className="space-y-1">{conversations.map((conversation) => <button key={conversation.id} onClick={() => openConversation(conversation.id)} className={`w-full truncate rounded-md px-3 py-2 text-left text-sm ${conversationId === conversation.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>{conversation.title || 'Untitled chat'}</button>)}</div>}</aside>
      <section className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-10">{messages.length === 0 ? <div className="mx-auto max-w-2xl pt-12"><div className="mb-8"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Ask the contract</p><h1 className="text-3xl font-semibold tracking-tight">Find the clause, then prove it.</h1><p className="mt-3 text-slate-500">Answers are grounded in exact document text and checked before they reach you.</p></div><div className="grid gap-2 sm:grid-cols-3">{['What does the force majeure clause say?', 'What are the termination rights?', 'Summarise the payment obligations.'].map((question) => <button key={question} onClick={() => setInput(question)} className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-700">{question}</button>)}</div></div> : messages.map((message, index) => <article key={`${message.id || index}-${message.role}`} className={message.role === 'user' ? 'ml-auto max-w-2xl' : 'max-w-3xl'}><div className={message.role === 'user' ? 'rounded-xl bg-indigo-600 px-4 py-3 text-sm text-white' : 'rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm'}>{message.role === 'assistant' && message.trace && message.trace.length > 0 && <details className="mb-3 text-xs text-slate-500" open={streaming && index === messages.length - 1}><summary className="cursor-pointer font-semibold">Research activity ({message.trace.length})</summary><div className="mt-2 space-y-1 border-l border-slate-200 pl-3">{message.trace.map((item, traceIndex) => <p key={traceIndex}>{item.type === 'tool_start' ? item.args_summary : item.summary}</p>)}</div></details>}<div className="whitespace-pre-wrap leading-7">{answerParts(message.content).map((part, partIndex) => part.quote ? <span key={partIndex} className="rounded bg-emerald-100 px-1 text-emerald-900">{part.text}</span> : <span key={partIndex}>{part.text}</span>)}</div>{message.status === 'stopped' && <span className="mt-3 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Stopped</span>}{message.role === 'assistant' && message.coverage && !message.coverage.complete && message.coverage.sections_total > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Searched {message.coverage.sections_read} of {message.coverage.sections_total} sections</div>}{message.role === 'assistant' && message.quotes && message.quotes.length === 0 && !streaming && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">No verified quotes support this answer</div>}{message.role === 'assistant' && message.quotes && message.quotes.length > 0 && !streaming && <QuoteCards quotes={message.quotes} onOpen={() => setNotice('Viewer coming next.')} />}</div></article>)}</div>
        {notice && <div className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-center text-xs text-amber-800">{notice}</div>}{error && <div className="flex items-center justify-between border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700"><span>{error}</span><button onClick={() => setError('')} className="font-semibold">Dismiss</button></div>}
        <form onSubmit={send} className="border-t border-slate-200 bg-white p-4 md:px-10"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-indigo-400"> <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event); } }} placeholder="Ask about this contract..." rows={1} className="min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm outline-none" /><button type={streaming ? 'button' : 'submit'} onClick={streaming ? stop : undefined} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white ${streaming ? 'bg-slate-700 hover:bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{streaming ? <><Square className="h-4 w-4" /> Stop</> : <><Send className="h-4 w-4" /> Send</>}</button></div></form>
      </section>
      <aside className="hidden border-l border-slate-200 bg-slate-100/70 p-5 md:block"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><PanelRight className="h-4 w-4" /> Document viewer</div><div className="mt-5 flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center"><FileText className="mb-3 h-8 w-8 text-slate-300" /><p className="text-sm font-medium text-slate-500">Viewer coming next</p><p className="mt-1 px-6 text-xs text-slate-400">Verified citations will open here in Phase 5.</p></div></aside>
    </div>
  </main>;
}