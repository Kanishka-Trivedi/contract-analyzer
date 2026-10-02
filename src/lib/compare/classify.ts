import { z } from 'zod';
import { streamChatCompletion } from '@/lib/llm/client';
import { ComparisonChange } from './types';
import { normalizeQuery } from '@/lib/verification/normalize';

export const aiChangeSchema = z.array(z.object({ id: z.string(), summary: z.string(), significance: z.enum(['critical', 'high', 'medium', 'low', 'cosmetic']), category: z.string() }));
const rank = { cosmetic: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
function tokens(text: string) { return new Set(normalizeQuery(text).split(/\s+/).filter(Boolean)); }
function similarity(a: string, b: string) { const left = tokens(a), right = tokens(b); const intersection = [...left].filter((token) => right.has(token)).length; return intersection / Math.max(1, new Set([...left, ...right]).size); }
export function applySignificanceFloor(change: ComparisonChange, proposed: ComparisonChange['significance']) {
  const text = `${change.oldText || ''} ${change.newText || ''}`.toLowerCase();
  const numeric = (change.numeric || []).length > 0;
  const protectedTerm = /money|cap|duration|indemnity|termination|governing law|exclusivity/.test(text);
  if (numeric || protectedTerm) {
    const floorSig = rank[proposed] > rank.high ? proposed : 'high';
    return { ...change, significance: rank[floorSig] > rank[change.significance] ? floorSig : change.significance };
  }
  return { ...change, significance: proposed };
}
export function fallbackClassification(change: ComparisonChange) {
  const numeric = (change.numeric || []).length > 0;
  if (!numeric && change.oldText && change.newText && change.type === 'modified') {
    const sim = similarity(change.oldText, change.newText);
    const refsMatch = change.oldRef && change.newRef && change.oldRef === change.newRef;
    if (sim > 0.7 || (refsMatch && sim > 0.3)) {
      return { summary: 'Clause reworded with same meaning', significance: 'cosmetic' as const, category: 'drafting' };
    }
  }
  return { summary: numeric ? `Numeric terms changed: ${(change.numeric || []).map((item) => `${item.old} -> ${item.new}`).join(', ')}` : change.summary, significance: numeric ? 'high' as const : change.significance, category: numeric ? 'commercial terms' : change.category };
}
export async function classifyBatch(changes: ComparisonChange[]) {
  const output: ComparisonChange[] = [];
  for (let start = 0; start < changes.length; start += 10) {
    const batch = changes.slice(start, start + 10); let parsed = [] as z.infer<typeof aiChangeSchema>;
    try { let raw = ''; for await (const delta of streamChatCompletion([{ role: 'system', content: 'Return only JSON array. Same-meaning rewording is cosmetic. Money, caps, durations, indemnity, termination rights, governing law, and exclusivity are at least high.' }, { role: 'user', content: JSON.stringify(batch.map(({ id, oldText, newText }) => ({ id, oldText, newText }))) }], [])) raw += delta.content || ''; parsed = aiChangeSchema.parse(JSON.parse(raw)); } catch { parsed = []; }
    batch.forEach((change) => { const ai = parsed.find((item) => item.id === change.id); const fallback = fallbackClassification(change); output.push(applySignificanceFloor({ ...change, summary: ai?.summary || fallback.summary, category: ai?.category || fallback.category }, ai?.significance || fallback.significance)); });
  }
  return output;
}