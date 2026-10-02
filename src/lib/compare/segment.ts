import { detectSections } from '@/lib/document-processing/utils';
import { ClauseUnit } from './types';

export function segmentDocument(text: string, rows: Array<{ idx: number; number: string | null; title: string | null; start_offset: number; end_offset: number; page_from: number }> = [], page = 1): ClauseUnit[] {
  if (rows.length >= 5) return rows.map((row, index) => ({ ref: row.number || String(index + 1), title: row.title || '', text: text.slice(row.start_offset, row.end_offset).trim(), page: row.page_from, start: row.start_offset, end: row.end_offset, index }));
  const detected = detectSections(text);
  const headings = detected.length ? detected : text.split(/\n\s*\n/).map((part, index, all) => { const start = all.slice(0, index).join('\n\n').length + (index ? 2 : 0); return { idx: index, number: '', title: part.split(/\n/)[0].slice(0, 80), start_offset: start, end_offset: start + part.length }; });
  return headings.map((row, index) => ({ ref: row.number || String(index + 1), title: row.title, text: text.slice(row.start_offset, row.end_offset).trim(), page, start: row.start_offset, end: row.end_offset, index }));
}