import { z } from 'zod';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chunks, documents, pages, sections } from '@/lib/db/schema';

const selectedId = z.union([z.string(), z.number()]).transform(Number)
  .refine((value) => Number.isInteger(value) && value > 0, 'doc_id must be a positive integer');

const schemas = {
  list_clauses: z.object({ doc_id: selectedId }),
  get_section: z.object({
    doc_id: selectedId,
    number_or_index: z.union([z.string(), z.number()]),
    offset: z.number().int().min(0).optional(),
  }),
  search_document: z.object({
    doc_id: selectedId,
    query: z.string().min(1),
    top_k: z.number().int().min(1).max(8).default(5),
  }),
  read_pages: z.object({ doc_id: selectedId, from: z.number().int().min(1), to: z.number().int().min(1) }),
  list_documents: z.object({}),
};

const commonDoc = { type: 'integer' };
export const TOOL_DEFINITIONS = [
  { type: 'function', function: { name: 'list_clauses', description: 'List numbered clauses in one selected document.', parameters: { type: 'object', properties: { doc_id: commonDoc }, required: ['doc_id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_section', description: 'Read one selected clause with pagination.', parameters: { type: 'object', properties: { doc_id: commonDoc, number_or_index: { anyOf: [{ type: 'string' }, { type: 'integer' }] }, offset: { type: 'integer', minimum: 0 } }, required: ['doc_id', 'number_or_index'], additionalProperties: false } } },
  { type: 'function', function: { name: 'search_document', description: 'Search one selected document for relevant passages.', parameters: { type: 'object', properties: { doc_id: commonDoc, query: { type: 'string' }, top_k: { type: 'integer', minimum: 1, maximum: 8 } }, required: ['doc_id', 'query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'read_pages', description: 'Read up to five pages from one selected document.', parameters: { type: 'object', properties: { doc_id: commonDoc, from: { type: 'integer', minimum: 1 }, to: { type: 'integer', minimum: 1 } }, required: ['doc_id', 'from', 'to'], additionalProperties: false } } },
  { type: 'function', function: { name: 'list_documents', description: 'List documents selected for this conversation.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
];

export type ToolCoverage = {
  sections_total: number;
  sections_read: number;
  pages_total: number;
  pages_read: number;
  complete: boolean;
};

export type ToolResult = { data: unknown; summary: string; coverage?: Partial<ToolCoverage> };

function assertSelected(id: number, selectedDocIds: number[]) {
  if (!selectedDocIds.includes(id)) throw new Error(`Document ${id} is not selected for this conversation`);
}

function selectedDocuments(ids: number[]) {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

export async function executeTool(name: string, rawArgs: unknown, selectedDocIds: number[]): Promise<ToolResult> {
  const schema = schemas[name as keyof typeof schemas];
  if (!schema) throw new Error(`Unknown tool: ${name}`);
  const args = schema.parse(rawArgs) as Record<string, unknown>;

  if (name === 'list_documents') {
    const rows = await db.select({ id: documents.id, name: documents.name }).from(documents)
      .where(sql`${documents.id} in (${selectedDocuments(selectedDocIds)})`);
    return { data: rows, summary: `Listed ${rows.length} selected document${rows.length === 1 ? '' : 's'}` };
  }

  const id = Number(args.doc_id);
  assertSelected(id, selectedDocIds);

  if (name === 'list_clauses') {
    const rows = await db.select({ number: sections.number, title: sections.title, page_from: sections.page_from, page_to: sections.page_to })
      .from(sections).where(eq(sections.doc_id, id)).orderBy(asc(sections.idx));
    const [doc] = await db.select({ page_count: documents.page_count }).from(documents).where(eq(documents.id, id));
    return { data: rows, summary: `Listed ${rows.length} clauses`, coverage: { sections_total: rows.length, pages_total: doc?.page_count || 0 } };
  }

  if (name === 'get_section') {
    const selector = args.number_or_index;
    const section = typeof selector === 'number'
      ? (await db.select().from(sections).where(and(eq(sections.doc_id, id), eq(sections.idx, selector))).limit(1))[0]
      : (await db.select().from(sections).where(and(eq(sections.doc_id, id), eq(sections.number, String(selector)))).limit(1))[0];
    if (!section) return { data: { error: 'Section not found' }, summary: 'Section not found' };
    const [doc] = await db.select({ full_text: documents.full_text, page_count: documents.page_count }).from(documents).where(eq(documents.id, id));
    const offset = Number(args.offset || 0);
    const rawText = (doc?.full_text || '').slice(section.start_offset + offset, section.end_offset);
    const truncated = rawText.length > 6000;
    return {
      data: { number: section.number, title: section.title, page_from: section.page_from, page_to: section.page_to, text: rawText.slice(0, 6000), truncated },
      summary: `Read section ${section.number || section.idx}`,
      coverage: { sections_total: 1, sections_read: offset === 0 ? 1 : 0, pages_total: doc?.page_count || 0, pages_read: section.page_to - section.page_from + 1 },
    };
  }

  if (name === 'read_pages') {
    const from = Number(args.from);
    const requestedTo = Number(args.to);
    const to = Math.min(requestedTo, from + 4);
    const rows = await db.select({ page_no: pages.page_no, text: pages.text }).from(pages)
      .where(and(eq(pages.doc_id, id), gte(pages.page_no, from), lte(pages.page_no, to))).orderBy(asc(pages.page_no));
    const [doc] = await db.select({ page_count: documents.page_count }).from(documents).where(eq(documents.id, id));
    return { data: { pages: rows, truncated: requestedTo > to }, summary: `Read pages ${from}-${to}`, coverage: { pages_total: doc?.page_count || 0, pages_read: rows.length } };
  }

  const query = String(args.query);
  const topK = Number(args.top_k);
  let rows = await db.select({ chunk_idx: chunks.idx, text: chunks.text }).from(chunks)
    .where(and(eq(chunks.doc_id, id), sql`to_tsvector('simple', coalesce(${chunks.tsv}, ${chunks.text})) @@ plainto_tsquery('simple', ${query})`)).limit(topK);
  if (rows.length === 0) {
    rows = await db.select({ chunk_idx: chunks.idx, text: chunks.text }).from(chunks)
      .where(and(eq(chunks.doc_id, id), sql`similarity(${chunks.text}, ${query}) > 0.05`))
      .orderBy(sql`similarity(${chunks.text}, ${query}) desc`).limit(topK);
  }
  const [doc] = await db.select({ page_count: documents.page_count }).from(documents).where(eq(documents.id, id));
  const [sectionCount] = await db.select({ count: sql<number>`count(*)` }).from(sections).where(eq(sections.doc_id, id));
  return {
    data: rows.map((row) => ({ chunk_idx: row.chunk_idx, section: null, page: null, snippet: row.text })),
    summary: `Found ${rows.length} passage${rows.length === 1 ? '' : 's'}`,
    coverage: { sections_total: Number(sectionCount?.count || 0), sections_read: 0, pages_total: doc?.page_count || 0, pages_read: 0 },
  };
}