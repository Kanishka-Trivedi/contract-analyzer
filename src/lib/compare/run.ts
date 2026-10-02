import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { comparisons, documents, sections, pages } from '@/lib/db/schema';
import { verifyQuote } from '@/lib/verification/verifyQuote';
import { normalizeWithMap } from '@/lib/verification/normalize';
import { alignClauses } from './align';
import { classifyBatch } from './classify';
import { segmentDocument } from './segment';

async function doc(id: number) { const [row] = await db.select().from(documents).where(eq(documents.id, id)); const sectionRows = await db.select({ idx: sections.idx, number: sections.number, title: sections.title, start_offset: sections.start_offset, end_offset: sections.end_offset, page_from: sections.page_from }).from(sections).where(eq(sections.doc_id, id)); const pageRows = await db.select({ page_no: pages.page_no, start_offset: pages.start_offset, end_offset: pages.end_offset }).from(pages).where(eq(pages.doc_id, id)); return { row, sectionRows, pageRows }; }
export async function runComparison(id: number, docAId: number, docBId: number) {
  try {
    const [a, b] = await Promise.all([doc(docAId), doc(docBId)]); if (!a.row?.full_text || !b.row?.full_text) throw new Error('Documents have no extracted text');
    await db.update(comparisons).set({ status: 'aligning', progress_pct: 20 }).where(eq(comparisons.id, id));
    const oldUnits = segmentDocument(a.row.full_text, a.sectionRows); const newUnits = segmentDocument(b.row.full_text, b.sectionRows); let changes = alignClauses(oldUnits, newUnits);
    await db.update(comparisons).set({ status: 'analysing', progress_pct: 45 }).where(eq(comparisons.id, id));
    changes = await classifyBatch(changes.filter((change) => change.type !== 'unchanged'));
    const docs = [a, b]; changes = changes.map((change) => { const oldText = change.oldText || ''; const newText = change.newText || ''; const makeQuote = (entry: typeof a, text: string) => { if (!text || !entry.row) return null; const normalized = normalizeWithMap(entry.row.full_text || ''); const result = verifyQuote({ id: entry.row.id, fullText: entry.row.full_text || '', normText: normalized.norm, map: normalized.map, pages: entry.pageRows.map((page) => ({ pageNo: page.page_no, start: page.start_offset, end: page.end_offset })) }, text); return result.status === 'unverified' ? null : { text, status: result.status, occurrences: result.occurrences }; }; return { ...change, oldQuote: makeQuote(docs[0], oldText), newQuote: makeQuote(docs[1], newText) }; });
    const top = changes.filter((change) => change.type !== 'unchanged').sort((x, y) => ({ critical: 0, high: 1, medium: 2, low: 3, cosmetic: 4 }[x.significance] - { critical: 0, high: 1, medium: 2, low: 3, cosmetic: 4 }[y.significance])).slice(0, 15); const summary = top.map((change) => `${change.significance.toUpperCase()}: ${change.summary}`);
    await db.update(comparisons).set({ status: 'complete', progress_pct: 100, summary_json: summary, changes_json: changes }).where(eq(comparisons.id, id));
  } catch (error) { await db.update(comparisons).set({ status: 'error', progress_pct: 100, summary_json: [error instanceof Error ? error.message : 'Comparison failed'], changes_json: [] }).where(eq(comparisons.id, id)); }
}