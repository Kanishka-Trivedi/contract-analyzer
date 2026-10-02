import { pgTable, serial, text, varchar, integer, timestamp, boolean, jsonb, real, customType, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

const bytea = customType<{ data: Buffer; driverData: unknown }>({
  dataType() {
    return 'bytea';
  },
});

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  mime: varchar('mime', { length: 255 }).notNull(),
  size: integer('size').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('uploading'), // uploading|extracting|indexing|ready|failed
  progress_pct: integer('progress_pct').default(0),
  status_message: text('status_message'),
  error_code: varchar('error_code', { length: 100 }),
  page_count: integer('page_count').default(0),
  file_bytes: bytea('file_bytes'), // storing directly as requested
  full_text: text('full_text'),
  norm_text: text('norm_text'),
  norm_map: jsonb('norm_map'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  doc_id: integer('doc_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  page_no: integer('page_no').notNull(),
  text: text('text').notNull(),
  start_offset: integer('start_offset').notNull(),
  end_offset: integer('end_offset').notNull(),
});

export const sections = pgTable('sections', {
  id: serial('id').primaryKey(),
  doc_id: integer('doc_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  idx: integer('idx').notNull(),
  number: varchar('number', { length: 100 }),
  title: text('title'),
  start_offset: integer('start_offset').notNull(),
  end_offset: integer('end_offset').notNull(),
  page_from: integer('page_from').notNull(),
  page_to: integer('page_to').notNull(),
});

export const chunks = pgTable('chunks', {
  id: serial('id').primaryKey(),
  doc_id: integer('doc_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  idx: integer('idx').notNull(),
  text: text('text').notNull(),
  start_offset: integer('start_offset').notNull(),
  end_offset: integer('end_offset').notNull(),
  tsv: text('tsv'),
}, (table) => ({
  tsvIdx: index('tsv_idx').using('gin', sql`${table.tsv} gin_trgm_ops`)
}));

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 20 }).notNull().default('single'), // single|multi
  doc_ids: jsonb('doc_ids').notNull(), // Array of document IDs
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversation_id: integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // user|assistant|system
  content: text('content').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('complete'), // complete|stopped|error
  quotes_json: jsonb('quotes_json'),
  coverage_json: jsonb('coverage_json'),
  tool_trace_json: jsonb('tool_trace_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const comparisons = pgTable('comparisons', {
  id: serial('id').primaryKey(),
  doc_a_id: integer('doc_a_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  doc_b_id: integer('doc_b_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  progress_pct: integer('progress_pct').notNull().default(0),
  summary_json: jsonb('summary_json'),
  changes_json: jsonb('changes_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const documentRelations = relations(documents, ({ many }) => ({
  pages: many(pages),
  sections: many(sections),
  chunks: many(chunks),
}));

export const conversationRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversation_id],
    references: [conversations.id],
  }),
}));
