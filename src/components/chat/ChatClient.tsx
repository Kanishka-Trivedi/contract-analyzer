'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, MessageSquare, MoreHorizontal, Send, Square, Sparkles, Trash2, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DocumentViewer, { DocumentViewerHandle, ViewerQuote } from '@/components/viewer/DocumentViewer';
import { findUnverifiedFigures } from '@/lib/compare/numeric';

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

function prepareMarkdown(text: string, quotes?: Quote[], streaming?: boolean, docs?: { name: string }[]) {
  let processed = text;
  if (streaming) processed = processed.replace(/<[^>]*$/, '');
  
  if (docs) {
    for (const doc of docs) {
      const safeName = doc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      processed = processed.replace(new RegExp(`\`(${safeName})\``, 'g'), '**$1**');
    }
  }

  let quoteIndex = 0;
  processed = processed.replace(/<quote(?:\s+doc=['"]?([^'">\s]+)['"]?)?\s*>([\s\S]*?)<\/quote>/g, (match, docId, content) => {
    quoteIndex++;
    const quote = quotes ? quotes[quoteIndex - 1] : undefined;
    const isUnverified = quote?.status === 'unverified';
    const marker = isUnverified ? `~~[${quoteIndex}]~~` : `[${quoteIndex}]`;
    return `${content} [${marker}](#quote-${quoteIndex - 1})`;
  });
  return processed;
}

function QuoteCards({ quotes, onOpen, docs }: { quotes: Quote[]; onOpen: (quote: Quote, index: number) => void; docs: { id: number; name: string }[] }) {
  const [showUnverified, setShowUnverified] = useState(false);
  const verified = quotes.filter((quote) => quote.status !== 'unverified');
  const unverified = quotes.filter((quote) => quote.status === 'unverified');
  return <div className="mt-4 space-y-2">
    {verified.map((quote, index) => {
      const docName = docs.find(d => String(d.id) === quote.docId)?.name;
      return <div key={`${quote.text}-${index}`} className={`glass p-3 text-sm rounded-[var(--radius-md)] border-l-4 ${quote.status === 'verified' ? 'border-[var(--verified)] bg-emerald-50/50' : 'border-[var(--partial)] bg-amber-50/50'}`}>
      <div className="flex items-center gap-2 font-semibold tracking-[0.14em] uppercase text-[10px]">
        <span className={quote.status === 'verified' ? 'text-[var(--verified)]' : 'text-[var(--partial)]'}>{quote.status === 'verified' ? 'Verified' : 'Close match'}</span>
        {docName && <span className="rounded-[var(--radius-chip)] bg-[var(--card-line)] px-2 py-0.5 text-[10px] text-[var(--muted)]" title={docName}>{docName}</span>}
        <span className="text-[var(--muted)]">Page {quote.occurrences[0]?.pageFrom || 1}{quote.occurrences[0]?.pageTo && quote.occurrences[0].pageTo !== quote.occurrences[0].pageFrom ? `-${quote.occurrences[0].pageTo}` : ''}</span>
      </div>
      <p className="mt-2 text-[var(--text)] italic">&ldquo;{quote.status === 'partial' ? quote.matchedText || quote.text : quote.text}&rdquo;</p>
      <button onClick={() => onOpen(quote, 0)} className="mt-3 text-xs font-semibold text-[#8B5CF6] hover:text-[#5B5BF5] transition-colors">Open in document</button>
    </div>;
    })}
    {unverified.length > 0 && <div className="glass border border-[var(--unverified)] bg-red-50/50 rounded-[var(--radius-md)]">
      <button onClick={() => setShowUnverified(!showUnverified)} className="w-full px-3 py-2 text-left text-xs font-semibold tracking-[0.14em] uppercase text-[var(--unverified)]">{showUnverified ? 'Hide' : 'Show'} Unverified ({unverified.length})</button>
      {showUnverified && <div className="space-y-2 border-t border-[var(--unverified)] p-3">{unverified.map((quote, index) => <div key={`${quote.text}-${index}`}><p className="text-sm text-[var(--unverified)] line-through italic">&ldquo;{quote.text}&rdquo;</p><p className="text-[10px] tracking-[0.14em] uppercase text-[var(--unverified)] mt-1">Could not be verified in the document</p></div>)}</div>}
    </div>}
  </div>;
}

export default function ChatClient({ documents }: { documents: { id: number; name: string; mime: string; page_count: number | null }[] }) {
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
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

  const firstDocId = documents[0].id;
  const docIdsStr = documents.map(d => d.id).join(',');

  const routeBase = useMemo(() => {
    return `/documents/${firstDocId}?docs=${docIdsStr}`;
  }, [firstDocId, docIdsStr]);

  const openConversation = useCallback(async (id: number) => {
    abortRef.current?.abort();
    generationRef.current += 1;
    conversationIdRef.current = id;
    setStreaming(false);
    setError('');
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return setError('Could not open that conversation.');
    const data = await response.json();
    setConversationId(id);
    router.replace(`${routeBase}&chat=${id}`);
    setMessages(data.messages.filter((message: ChatMessage) => message.role === 'user' || message.role === 'assistant').map((message: ChatMessage) => ({ ...message, quotes: message.quotes_json || [], coverage: message.coverage_json, trace: message.tool_trace_json || [] })));
  }, [routeBase, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get('chat');
    const loadConversations = async () => {
      try {
        const response = await fetch(`/api/conversations?docId=${firstDocId}`);
        if (response.ok) {
          const data = await response.json();
          setConversations(data);
          if (chatParam && chatParam !== 'new' && data.some((c: Conversation) => c.id === Number(chatParam))) {
            await openConversation(Number(chatParam));
          }
        } else {
          setError('Could not load chat history.');
        }
      } catch {
        setError('Could not load chat history.');
      } finally {
        setLoadingHistory(false);
      }
    };
    loadConversations();
  }, [firstDocId, openConversation]);

  useEffect(() => {
    if (!isAtLatestRef.current) return;
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming]);

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
      const response = await fetch(`/api/conversations?docId=${documents[0].id}`, { method: 'DELETE' });
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
    let optimisticCreated = false;
    if (!requestConversationId) {
      const tempId = -Date.now();
      const optimisticConv: Conversation = { id: tempId, title: message.slice(0, 60), createdAt: new Date().toISOString() };
      setConversations((current) => [optimisticConv, ...current]);
      optimisticCreated = true;
    }
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: requestConversationId, docIds: documents.map(d => d.id), message }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error((await response.json()).error || 'Chat request failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const apply = (event: Record<string, unknown>) => setMessages((current) => {
        if (generationRef.current !== requestGeneration) return current;
        const next = [...current]; const last = next[next.length - 1];
        if (!last || last.role !== 'assistant') return current;
        if (event.type === 'token') last.content += String(event.text || '');
        if (event.type === 'reset') last.content = '';
        if (event.type === 'tool_start' || event.type === 'tool_result') last.trace = [...(last.trace || []), event as ChatMessage['trace'] extends Array<infer T> ? T : never];
        if (event.type === 'quotes') last.quotes = event.items as Quote[];
        if (event.type === 'coverage') last.coverage = event.coverage as Coverage;
        if (event.type === 'done') { last.content = String(event.answer || last.content); last.quotes = event.quotes as Quote[]; last.coverage = event.coverage as Coverage; last.trace = event.tool_trace as ChatMessage['trace']; }
        if (event.type === 'stopped') last.status = 'stopped';
        if (event.type === 'error') {
          last.status = 'error';
          if (!last.content) last.content = String(event.message);
        }
        return next;
      });
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) if (line.trim()) { const event = JSON.parse(line) as Record<string, unknown>; if (event.type === 'error') { apply(event); } else { apply(event); } }
      }
    } catch (caught) {
      if ((caught as Error).name === 'AbortError') setNotice('Stopped. Your partial answer was saved.');
      else setError(caught instanceof Error ? caught.message : 'Chat request failed');
    } finally {
      if (generationRef.current === requestGeneration) {
        setStreaming(false);
        abortRef.current = null;
        const historyResponse = await fetch(`/api/conversations?docId=${documents[0].id}`);
        if (historyResponse.ok) {
          const refreshedConversations = await historyResponse.json() as Conversation[];
          setConversations(refreshedConversations);
          if (!requestConversationId && refreshedConversations.length > 0) {
            const latest = refreshedConversations[0];
            conversationIdRef.current = latest.id;
            setConversationId(latest.id);
            router.replace(`${routeBase}&chat=${latest.id}`);
          }
        }
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
    router.replace(`${routeBase}&chat=new`);
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

  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--paper)] text-[var(--text)]">
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[var(--card-line)] bg-[var(--card)] px-5 z-20">
      <Link href="/library" className="rounded-[var(--radius-btn)] p-2 text-[var(--muted)] hover:bg-[var(--paper)] transition-colors" title="Back to library"><ArrowLeft className="h-5 w-5" /></Link>
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{documents.length === 1 ? documents[0].name : `${documents.length} documents`}</p><p className="text-[10px] tracking-[0.14em] uppercase text-[var(--muted)] mt-0.5 flex items-center">{documents.reduce((acc, d) => acc + (d.page_count || 0), 0)} pages · Contract analysis{documents.length > 1 && <span className="ml-2 flex flex-wrap gap-1 items-center">{documents.map(d => <span key={d.id} className="rounded-[var(--radius-chip)] bg-[var(--card-line)] px-2 py-0.5 normal-case tracking-normal">{d.name}</span>)}</span>}</p></div>
      <div className="ml-auto flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><button onClick={() => setMobileViewerOpen(true)} className="rounded-[var(--radius-btn)] border border-[var(--card-line)] px-2 py-1 text-xs lg:hidden">Viewer</button><Sparkles className="h-4 w-4 text-[var(--gold)]" /> Evidence-first assistant</div>
    </header>
    <div className="flex min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[260px_minmax(0,1fr)_var(--viewer-width)]" style={{ '--viewer-width': viewerCollapsed ? '28px' : `${viewerWidth}px` } as React.CSSProperties}>
      <aside className="aurora-bg flex min-h-0 flex-col overflow-y-auto border-b border-[var(--card-line)] p-4 md:border-b-0 md:border-r relative">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="relative z-10 flex flex-col h-full">
          <button onClick={newChat} className="glass-dark mb-6 flex w-full shrink-0 items-center justify-center gap-2 rounded-[var(--radius-btn)] px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"><MessageSquare className="h-4 w-4" /> New chat</button>
          <div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Recent chats</div>{conversations.length > 0 && <details className="relative"><summary className="list-none cursor-pointer rounded-[var(--radius-btn)] p-1 text-white/50 hover:bg-white/10 transition-colors" title="Chat actions"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 z-10 mt-1 w-52 rounded-[var(--radius-md)] border border-[var(--card-line)] bg-[var(--card)] p-1 shadow-lg"><button onClick={deleteAllConversations} className="w-full rounded-[var(--radius-btn)] px-2 py-1.5 text-left text-xs font-semibold text-[var(--unverified)] hover:bg-[var(--sig-critical-soft)]">Delete all chats for this document</button></div></details>}</div>
          {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin text-white/50 mx-auto mt-4" /> : conversations.length === 0 ? <p className="text-sm text-white/40 italic">No conversations yet.</p> : <div className="space-y-2 flex-1 overflow-y-auto pr-1">{conversations.map((conversation) => <div key={conversation.id} className={`group flex items-center gap-1 rounded-[var(--radius-btn)] transition-all ${conversationId === conversation.id ? 'glass-dark border-white/20 shadow-[var(--shadow-glow)]' : 'border border-transparent hover:glass-dark'}`}><button onClick={() => openConversation(conversation.id)} className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${conversationId === conversation.id ? 'text-white' : 'text-white/70'}`}><span className="block truncate font-semibold">{conversation.title || 'Untitled chat'}</span><span className="block text-[10px] tracking-[0.14em] uppercase text-white/40 mt-0.5">{hydrated ? relativeTime(conversation.createdAt) : ''}</span></button><button onClick={() => deleteConversation(conversation)} className="mr-1 rounded p-2 text-white/40 opacity-100 hover:bg-[var(--unverified)] hover:text-white transition-colors md:opacity-0 md:group-hover:opacity-100" title="Delete chat" aria-label={`Delete ${conversation.title || 'chat'}`}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
        </div>
      </aside>
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={messageListRef} onScroll={handleMessageScroll} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-8 md:px-10 pb-40">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl pt-12 fade-up"><div className="mb-10"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B5CF6]">Ask the contract{documents.length > 1 ? 's' : ''}</p><h1 className="text-4xl font-semibold tracking-[-0.02em] font-heading">Find the clause, then prove it.</h1><p className="mt-4 text-[var(--muted)] text-lg">Answers are grounded in exact document text and checked before they reach you.</p></div><div className="grid gap-3 sm:grid-cols-3">{['What does the force majeure clause say?', 'What are the termination rights?', 'Summarise the payment obligations.'].map((question, i) => <button key={question} onClick={() => setInput(question)} className={`glass border-[var(--card-line)] rounded-[var(--radius-card)] p-4 text-left text-sm font-semibold text-[var(--muted)] hover:text-[#8B5CF6] hover:border-[#8B5CF6] hover:shadow-[var(--shadow-glow)] transition-all stagger-${i+1}`}>{question}</button>)}</div></div>
          ) : (
            messages.map((message, index) => {
              let unverifiedFigures: string[] = [];
              if (message.role === 'assistant' && message.quotes && !streaming && message.status !== 'error') {
                const verifiedQuoteTexts = message.quotes.filter(q => q.status !== 'unverified').map(q => q.text);
                unverifiedFigures = findUnverifiedFigures(message.content, verifiedQuoteTexts);
              }
              return (
                <article key={`${message.id || index}-${message.role}`} className={message.role === 'user' ? 'ml-auto max-w-2xl fade-up' : 'max-w-3xl fade-up'}>
                  <div className={message.role === 'user' ? 'rounded-[var(--radius-card)] rounded-br-sm glass-dark bg-[var(--ink-900)] px-5 py-4 text-sm text-white shadow-lg' : 'rounded-[var(--radius-card)] rounded-bl-sm border border-[var(--card-line)] bg-[var(--card)] px-6 py-5 shadow-[var(--shadow-card)]'}>
                    {message.role === 'assistant' && message.trace && message.trace.length > 0 && <details className="mb-4 text-xs text-[var(--muted)]" open={streaming && index === messages.length - 1}><summary className="cursor-pointer font-semibold tracking-[0.14em] uppercase text-[10px]">Research activity ({message.trace.length})</summary><div className="mt-3 space-y-2 border-l-2 border-[var(--card-line)] pl-4">{message.trace.map((item, traceIndex) => <p key={traceIndex} className="italic">{item.type === 'tool_start' ? item.args_summary : item.summary}</p>)}</div></details>}
                    {message.status === 'error' ? (
                      <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--unverified)] bg-[var(--sig-critical-soft)] px-4 py-3 text-sm font-semibold text-[var(--unverified)]"><span>{message.content}</span><button type="button" onClick={() => { setInput(messages[index - 1]?.content || ''); setTimeout(() => inputRef.current?.focus(), 10); }} className="hover:underline">Retry</button></div>
                    ) : (
                      <div className="prose prose-sm prose-slate max-w-none leading-[1.6]">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node, href, children, ...props }) => {
                              if (href?.startsWith('#quote-')) {
                                const idx = parseInt(href.replace('#quote-', ''), 10);
                                const quote = message.quotes?.[idx];
                                const isUnverified = quote?.status === 'unverified';
                                return <button type="button" onClick={() => quote && openCitation(quote, 0)} className={`ml-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-bold tracking-wider ${isUnverified ? 'text-[var(--unverified)] bg-[var(--sig-critical-soft)] line-through' : 'text-[var(--gold)] bg-[var(--gold-soft)] hover:bg-[var(--gold)] hover:text-white transition-colors shadow-sm'}`} title={isUnverified ? 'Unverified' : 'View in document'}>{children}</button>;
                              }
                              return <a href={href} className="text-[#8B5CF6] font-semibold hover:underline" {...props}>{children}</a>;
                            },
                            table: ({ node, ...props }) => <div className="overflow-x-auto my-4"><table className="w-full border-collapse border border-[var(--card-line)] text-sm rounded-[var(--radius-md)] overflow-hidden" {...props} /></div>,
                            th: ({ node, ...props }) => <th className="border-b border-[var(--card-line)] bg-[var(--paper)] px-4 py-3 text-left font-semibold text-[var(--muted)] tracking-[0.14em] uppercase text-[10px]" {...props} />,
                            td: ({ node, ...props }) => <td className="border-b border-[var(--card-line)] px-4 py-3 text-[var(--text)]" {...props} />,
                            strong: ({ node, ...props }) => <strong className="font-semibold text-[var(--text)]" {...props} />,
                          }}
                        >
                          {prepareMarkdown(message.content, message.quotes, streaming && index === messages.length - 1, documents)}
                        </ReactMarkdown>
                      </div>
                    )}
                    {message.status === 'stopped' && <span className="mt-4 inline-flex rounded-[var(--radius-chip)] bg-[var(--partial)]/20 px-3 py-1 text-[10px] tracking-[0.14em] uppercase font-bold text-[var(--partial)]">Stopped</span>}
                    {message.role === 'assistant' && message.coverage && !message.coverage.complete && message.coverage.sections_total > 0 && <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--partial)] bg-[var(--sig-medium-soft)] px-4 py-3 text-sm font-medium text-[var(--partial)]">Searched {message.coverage.sections_read} of {message.coverage.sections_total} sections</div>}
                    {message.role === 'assistant' && message.quotes && message.quotes.length === 0 && !streaming && message.status !== 'error' && message.content.trim().length > 0 && <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--unverified)] bg-[var(--sig-critical-soft)] px-4 py-3 text-sm font-medium text-[var(--unverified)]">No verified quotes support this answer</div>}
                    {unverifiedFigures.length > 0 && <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--partial)] bg-[var(--sig-medium-soft)] px-4 py-3 text-sm font-medium text-[var(--partial)]">Some figures in the summary could not be matched to a verified quote: {unverifiedFigures.join(', ')}</div>}
                    {message.role === 'assistant' && message.quotes && message.quotes.length > 0 && !streaming && <QuoteCards quotes={message.quotes} onOpen={openCitation} docs={documents} />}
                  </div>
                </article>
              );
            })
          )}
        </div>
        {showJumpToLatest && <button onClick={jumpToLatest} className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--card-line)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[#8B5CF6] shadow-lg fade-up">Jump to latest</button>}
        {notice && <div className="border-t border-[var(--partial)] bg-[var(--sig-medium-soft)] px-5 py-3 text-center text-sm font-medium text-[var(--partial)]">{notice}</div>}{error && <div className="flex items-center justify-between border-t border-[var(--unverified)] bg-[var(--sig-critical-soft)] px-5 py-3 text-sm font-medium text-[var(--unverified)]"><span>{error}</span><button onClick={() => setError('')} className="font-bold hover:underline">Dismiss</button></div>}
        <form onSubmit={send} className="absolute bottom-6 left-0 right-0 px-4 md:px-10 z-20 pointer-events-none">
          <div className="mx-auto flex w-full max-w-[820px] items-end gap-2 rounded-[16px] border border-[#DCE0F2] bg-[#FFFFFF] p-[8px_8px_8px_16px] min-h-[56px] shadow-[0_8px_24px_-12px_rgba(15,21,48,0.18)] transition-all duration-200 focus-within:border-[#6366F1] focus-within:shadow-[0_0_0_4px_rgba(99,102,241,0.18)] pointer-events-auto"> 
            <textarea 
              ref={inputRef} 
              value={input} 
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = 'auto';
                event.target.style.height = Math.min(event.target.scrollHeight, 6 * 22) + 'px';
              }} 
              onKeyDown={(event) => { 
                if (event.key === 'Enter' && !event.shiftKey) { 
                  event.preventDefault(); 
                  send(event); 
                  if (inputRef.current) inputRef.current.style.height = 'auto';
                } 
              }} 
              placeholder="Ask about this contract..." 
              rows={1} 
              className="max-h-[132px] flex-1 resize-none bg-transparent py-[8px] text-[15px] font-sans text-[#0F1530] outline-none placeholder:text-[#8A93B5] border-none" 
            />
            {streaming ? (
              <button type="button" onClick={stop} className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] bg-[#FFFFFF] border-[1.5px] border-[#F43F5E] hover:bg-[#FFF1F3] active:bg-[#FFE0E5] transition-all duration-200 pointer-events-auto">
                <Square className="h-[14px] w-[14px] text-[#F43F5E] fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] bg-[#4F46E5] hover:bg-[#6366F1] hover:-translate-y-[1px] active:bg-[#3730A3] active:scale-95 disabled:bg-[#C7CAF5] disabled:hover:translate-y-0 disabled:active:scale-100 transition-all duration-200 border-none pointer-events-auto">
                <Send className="h-[20px] w-[20px] text-white ml-[2px]" />
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[#8A93B5] pointer-events-auto font-sans">
            <ShieldCheck className="h-[14px] w-[14px]" /> Answers use only your document. Every quote is verified.
          </div>
        </form>
      </section>
      <div className={`${mobileViewerOpen ? 'fixed inset-0 z-40 block' : 'hidden'} min-h-0 flex-col bg-black/40 backdrop-blur-sm lg:relative lg:inset-auto lg:z-auto lg:flex border-l border-[var(--card-line)] bg-white`} onClick={() => mobileViewerOpen && setMobileViewerOpen(false)}><div className="flex min-h-0 h-full w-full flex-1 lg:h-full" onClick={(event) => event.stopPropagation()}><DocumentViewer ref={viewerRef} docs={documents} width={viewerWidth} collapsed={viewerCollapsed} onWidthChange={setViewerWidth} onCollapse={setViewerCollapsed} onNotice={viewerNotice} /></div></div>
    </div>
  </main>;
}