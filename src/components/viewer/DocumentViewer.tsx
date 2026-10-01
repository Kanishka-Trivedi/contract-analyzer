'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, FileText, Minus, PanelRightClose, PanelRightOpen, Plus } from 'lucide-react';
import { mapNormalizedMatchToSpans, TextSpan } from './mapping';

export type ViewerOccurrence = { start: number; end: number; pageFrom: number; pageTo: number; segments?: { pageNo: number; text: string }[] };
export type ViewerQuote = { docId?: string; text: string; matchedText?: string; occurrences: ViewerOccurrence[]; status?: string };
export type DocumentViewerHandle = { openCitation: (quote: ViewerQuote, occurrenceIndex?: number) => void };

type Props = {
  initialDoc: { id: number; name: string; mime: string; page_count: number | null };
  width: number;
  collapsed: boolean;
  onWidthChange: (width: number) => void;
  onCollapse: (collapsed: boolean) => void;
  onNotice: (message: string) => void;
};

type PDFDocument = { numPages: number; getPage: (page: number) => Promise<PDFPage> };
type PDFPage = { getViewport: (options: { scale: number }) => { width: number; height: number; transform: number[] }; render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }; getTextContent: () => Promise<{ items: Array<{ str: string; transform?: number[] }> }> };

function clearHighlights(container: HTMLElement) {
  container.querySelectorAll('.citation-highlight').forEach((node) => node.remove());
}

function drawHighlights(container: HTMLElement, spans: Array<{ node: Text; start: number; end: number }>, ranges: Array<{ spanIndex: number; start: number; end: number }>) {
  clearHighlights(container);
  const containerRect = container.getBoundingClientRect();
  for (const rangeInfo of ranges) {
    const span = spans[rangeInfo.spanIndex];
    if (!span) continue;
    const range = document.createRange();
    range.setStart(span.node, Math.min(rangeInfo.start, span.node.length));
    range.setEnd(span.node, Math.min(rangeInfo.end, span.node.length));
    for (const rect of Array.from(range.getClientRects())) {
      const mark = document.createElement('div');
      mark.className = 'citation-highlight';
      mark.style.left = `${rect.left - containerRect.left + container.scrollLeft}px`;
      mark.style.top = `${rect.top - containerRect.top + container.scrollTop}px`;
      mark.style.width = `${rect.width}px`;
      mark.style.height = `${rect.height}px`;
      container.appendChild(mark);
    }
  }
}

const DocumentViewer = forwardRef<DocumentViewerHandle, Props>(function DocumentViewer({ initialDoc, width, collapsed, onWidthChange, onCollapse, onNotice }, ref) {
  const [activeDoc, setActiveDoc] = useState(initialDoc);
  const [openDocs, setOpenDocs] = useState([initialDoc]);
  const [pdf, setPdf] = useState<PDFDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());
  const [html, setHtml] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [citation, setCitation] = useState<{ quote: ViewerQuote; index: number } | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const pdfRef = useRef<PDFDocument | null>(null);
  const pendingRef = useRef<{ quote: ViewerQuote; index: number } | null>(null);
  const docxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdf(null); pdfRef.current = null; setLoadedPages(new Set()); setHtml(''); setCitation(null);
    if (activeDoc.mime.includes('word')) {
      fetch(`/api/documents/${activeDoc.id}/html`).then((response) => response.text()).then((value) => { if (!cancelled) setHtml(value); }).catch(() => onNotice('Could not load the document.'));
    } else {
      import('pdfjs-dist').then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const loaded = await pdfjs.getDocument({ url: `/api/documents/${activeDoc.id}/file` }).promise as unknown as PDFDocument;
        if (!cancelled) { pdfRef.current = loaded; setPdf(loaded); }
      }).catch(() => onNotice('Could not load the PDF viewer.'));
    }
    return () => { cancelled = true; };
  }, [activeDoc.id, activeDoc.mime, onNotice]);

  useEffect(() => {
    if (!pdf) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          setCurrentPage(page);
          setLoadedPages((current) => current.has(page) ? current : new Set(current).add(page));
        }
      });
    }, { rootMargin: '700px' });
    pageRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => {
    loadedPages.forEach((pageNumber) => { void renderPage(pageNumber); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedPages, zoom]);

  useEffect(() => {
    if (!citation || !pdf || activeDoc.mime.includes('word')) return;
    const occurrence = citation.quote.occurrences[citation.index];
    const page = occurrence?.pageFrom || 1;
    const pagesToHighlight = occurrence?.segments?.map((segment) => segment.pageNo) || [page];
    setLoadedPages((current) => new Set([...current, ...pagesToHighlight]));
    const target = pageRefs.current.get(page);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    pageRefs.current.forEach(clearHighlights);
    const timer = window.setTimeout(() => pagesToHighlight.forEach((pageNumber) => highlightPdfCitation(pageNumber, citation.quote, citation.index)), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citation, pdf, activeDoc.mime]);

  useEffect(() => {
    if (!citation || !activeDoc.mime.includes('word') || !html || !docxRef.current) return;
    const timer = window.setTimeout(() => highlightDocxCitation(citation.quote, citation.index), 100);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citation, html, activeDoc.mime]);

  useImperativeHandle(ref, () => ({
    openCitation(quote, occurrenceIndex = 0) {
      const nextDocId = Number(quote.docId || activeDoc.id);
      const occurrence = quote.occurrences[occurrenceIndex];
      if (!occurrence) return;
      pendingRef.current = { quote, index: occurrenceIndex };
      if (nextDocId !== activeDoc.id) {
        fetch(`/api/documents/${nextDocId}`).then((response) => response.json()).then((doc) => { setOpenDocs((current) => current.some((item) => item.id === doc.id) ? current : [...current, doc]); setActiveDoc(doc); }).catch(() => onNotice('Could not open that document.'));
      } else {
        pageRefs.current.forEach(clearHighlights);
        if (docxRef.current) clearHighlights(docxRef.current);
        setCitation({ quote, index: occurrenceIndex });
      }
    },
  }), [activeDoc.id, onNotice]);

  useEffect(() => {
    if (pendingRef.current && activeDoc.id === Number(pendingRef.current.quote.docId || activeDoc.id)) {
      setCitation(pendingRef.current);
      pendingRef.current = null;
    }
  }, [activeDoc.id]);

  async function renderPage(pageNumber: number) {
    const pageContainer = pageRefs.current.get(pageNumber);
    const currentPdf = pdfRef.current;
    if (!pageContainer || !currentPdf) return;
    const page = await currentPdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.15 * zoom });
    pageContainer.style.height = `${viewport.height}px`;
    pageContainer.style.width = `${viewport.width}px`;
    pageContainer.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.className = 'absolute inset-0 h-full w-full';
    pageContainer.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    const layer = document.createElement('div');
    layer.className = 'pdf-text-layer absolute inset-0 overflow-hidden';
    const textContent = await page.getTextContent();
    let offset = 0;
    for (const item of textContent.items) {
      const text = item.str || '';
      const span = document.createElement('span');
      span.textContent = text;
      span.style.left = '0';
      span.style.top = '0';
      span.style.fontSize = '1px';
      span.style.transformOrigin = '0 0';
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      span.style.transform = `matrix(${transform[0]},${transform[1]},${transform[2]},${transform[3]},${transform[4]},${viewport.height - transform[5]})`;
      span.dataset.start = String(offset);
      span.dataset.end = String(offset + text.length);
      layer.appendChild(span);
      offset += text.length;
    }
    pageContainer.appendChild(layer);
    if (citation && citation.quote.occurrences[citation.index]?.pageFrom === pageNumber) highlightPdfCitation(pageNumber, citation.quote, citation.index);
  }

  function getLayerSpans(container: HTMLElement) {
    let offset = 0;
    return Array.from(container.querySelectorAll('.pdf-text-layer span')).map((element) => {
      const node = element.firstChild as Text;
      const span = { node, start: offset, end: offset + (node?.length || 0) };
      offset = span.end + 1;
      return span;
    });
  }

  function highlightPdfCitation(pageNumber: number, quote: ViewerQuote, occurrenceIndex: number) {
    const pageContainer = pageRefs.current.get(pageNumber);
    if (!pageContainer) { onNotice("Couldn't pinpoint the exact text, showing the page"); return; }
    const spans = getLayerSpans(pageContainer);
    const textSpans: TextSpan[] = spans.map((span) => ({ text: `${span.node?.textContent || ''} `, start: span.start, end: span.end }));
    const segment = quote.occurrences[occurrenceIndex]?.segments?.find((item) => item.pageNo === pageNumber)?.text || quote.matchedText || quote.text;
    const ranges = mapNormalizedMatchToSpans(textSpans, segment);
    if (!ranges) { onNotice("Couldn't pinpoint the exact text, showing the page"); return; }
    drawHighlights(pageContainer, spans, ranges);
  }

  function highlightDocxCitation(quote: ViewerQuote, occurrenceIndex: number) {
    const container = docxRef.current;
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);
    let offset = 0;
    const spans = textNodes.map((textNode) => { const span = { node: textNode, start: offset, end: offset + textNode.length }; offset += textNode.length; return span; });
    const ranges = mapNormalizedMatchToSpans(spans.map((span) => ({ text: span.node.data, start: span.start, end: span.end })), quote.text, occurrenceIndex);
    if (!ranges) { onNotice("Couldn't pinpoint the exact text, showing the page"); return; }
    drawHighlights(container, spans, ranges);
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startResize(event: ReactPointerEvent) {
    dragRef.current = { x: event.clientX, width };
    const move = (moveEvent: PointerEvent) => onWidthChange(Math.max(280, Math.min(700, (dragRef.current?.width || width) - (moveEvent.clientX - (dragRef.current?.x || event.clientX)))));
    const stop = () => { dragRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  }

  if (collapsed) return <aside className="flex items-start justify-center border-l border-slate-200 bg-slate-100/70 p-2"><button onClick={() => onCollapse(false)} className="rounded p-2 text-slate-500 hover:bg-white" title="Open document viewer"><PanelRightOpen className="h-4 w-4" /></button></aside>;
  return <aside className="relative flex min-w-0 flex-col border-l border-slate-200 bg-slate-100/70" style={{ width }}>
    <div onPointerDown={startResize} className="absolute left-0 top-0 z-20 h-full w-1 cursor-ew-resize hover:bg-indigo-400" />
    <header className="border-b border-slate-200 bg-white px-3 py-2"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{activeDoc.name}</span>{citation && citation.quote.occurrences.length > 1 && <><button onClick={() => setCitation({ ...citation, index: Math.max(0, citation.index - 1) })} title="Previous occurrence"><ChevronLeft className="h-4 w-4" /></button><span className="whitespace-nowrap text-[11px] text-slate-500">Occurrence {citation.index + 1} of {citation.quote.occurrences.length}</span><button onClick={() => setCitation({ ...citation, index: Math.min(citation.quote.occurrences.length - 1, citation.index + 1) })} title="Next occurrence"><ChevronRight className="h-4 w-4" /></button></>}<button onClick={() => onCollapse(true)} title="Collapse document viewer"><PanelRightClose className="h-4 w-4 text-slate-500" /></button></div>{openDocs.length > 1 && <div className="mt-2 flex gap-1 overflow-x-auto">{openDocs.map((doc) => <button key={doc.id} onClick={() => { setActiveDoc(doc); setCitation(null); }} className={`max-w-[140px] truncate rounded px-2 py-1 text-[11px] ${doc.id === activeDoc.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{doc.name}</button>)}</div>}</header>
    {activeDoc.mime.includes('word') ? <div ref={docxRef} className="relative flex-1 overflow-auto bg-white p-6 text-sm leading-7 prose prose-slate" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="relative flex-1 overflow-auto p-4"><div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>{pdf ? `Page ${currentPage} of ${pdf.numPages} · ${loadedPages.size} rendered` : 'Loading document...'}</span><div className="flex items-center gap-1"><button onClick={() => setZoom(Math.max(0.6, zoom - 0.15))} title="Zoom out" className="rounded p-1 hover:bg-white"><Minus className="h-3.5 w-3.5" /></button><button onClick={() => setZoom(1)} title="Fit width" className="rounded px-1 text-[11px] hover:bg-white">Fit</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(2.5, zoom + 0.15))} title="Zoom in" className="rounded p-1 hover:bg-white"><Plus className="h-3.5 w-3.5" /></button></div></div><div className="space-y-4">{pdf && Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((pageNumber) => <div key={pageNumber} ref={(element) => { if (element) pageRefs.current.set(pageNumber, element); }} data-page={pageNumber} className="relative mx-auto min-h-[900px] max-w-full bg-white shadow-sm" />)}</div></div>}
  </aside>;
});

export default DocumentViewer;