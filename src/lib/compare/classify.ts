import { z } from 'zod';
import { streamChatCompletion } from '@/lib/llm/client';
import { ComparisonChange } from './types';
import { normalizeQuery } from '@/lib/verification/normalize';

export const aiChangeSchema = z.array(z.object({ id: z.string(), summary: z.string(), significance: z.enum(['critical', 'high', 'medium', 'low', 'cosmetic']), category: z.string() }));
const rank = { cosmetic: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
function tokens(text: string) { return new Set(normalizeQuery(text).split(/\s+/).filter(Boolean)); }
function similarity(a: string, b: string) { const left = tokens(a), right = tokens(b); const intersection = [...left].filter((token) => right.has(token)).length; return intersection / Math.max(1, new Set([...left, ...right]).size); }

export function applySignificanceFloor(change: ComparisonChange, proposed: ComparisonChange['significance']) {
  const numeric = (change.numeric || []).length > 0;
  const sim = (change.oldText && change.newText && change.type === 'modified') ? similarity(change.oldText, change.newText) : 1;
  const semanticChange = change.type === 'modified' && sim < 0.9 && proposed !== 'cosmetic';
  
  if (numeric || semanticChange) {
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
  let category = 'clause';
  let summary = change.summary;
  if (numeric) {
    const text = `${change.oldText || ''} ${change.newText || ''}`.toLowerCase();
    if (/liability|cap|limitation of liability/.test(text)) category = 'liability';
    else if (/indemnif/.test(text)) category = 'indemnity';
    else if (/terminat/.test(text)) category = 'termination';
    else if (/governing law|jurisdiction/.test(text)) category = 'governing_law';
    else if (/payment|fee|invoice/.test(text)) category = 'payment';
    else category = 'commercial terms';
    summary = `Numeric terms changed: ${(change.numeric || []).map((item) => `${item.old} -> ${item.new}`).join(', ')}`;
  }
  return { summary, significance: numeric ? 'high' as const : change.significance, category };
}

export async function classifyBatch(changes: ComparisonChange[]) {
  const output: ComparisonChange[] = [];
  const systemPrompt = `Return only a JSON array of objects. Strip any markdown fences.
Each object must have id, summary, significance, category.
Rules:
- summary: Plain language, naming the clause and business impact. NO "HIGH:" or similar prefixes. E.g. "Liability: the cap was raised tenfold, from AED 100,000 to AED 1,000,000, which increases the Provider's exposure."
- significance: critical, high, medium, low, cosmetic. Same-meaning rewording is cosmetic.
- category: A short string classifying the clause type (e.g. Liability, Termination, Governing Law).`;

  for (let start = 0; start < changes.length; start += 10) {
    const batch = changes.slice(start, start + 10);
    let parsed = [] as z.infer<typeof aiChangeSchema>;
    let success = false;
    
    for (let attempt = 0; attempt < 2 && !success; attempt++) {
      try {
        let raw = '';
        for await (const delta of streamChatCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(batch.map(({ id, oldText, newText }) => ({ id, oldText, newText }))) }
        ], [])) {
          raw += delta.content || '';
        }
        
        // Strip markdown fences
        const clean = raw.replace(/^```json\s*/m, '').replace(/```\s*$/m, '').trim();
        // Extract array if there's surrounding text
        const match = clean.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('No JSON array found');
        
        parsed = aiChangeSchema.parse(JSON.parse(match[0]));
        success = true;
      } catch (err) {
        console.error(`Batch classify failed (attempt ${attempt + 1}):`, err);
      }
    }
    
    batch.forEach((change) => {
      const ai = parsed.find((item) => item.id === change.id);
      const fallback = fallbackClassification(change);
      
      const finalChange = applySignificanceFloor(
        { ...change, summary: ai?.summary || fallback.summary, category: ai?.category || fallback.category },
        ai?.significance || fallback.significance
      );
      
      output.push({ ...finalChange, aiError: !ai });
    });
  }
  return output;
}