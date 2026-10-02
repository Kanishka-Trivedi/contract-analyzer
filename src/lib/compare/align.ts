import { normalizeQuery } from '@/lib/verification/normalize';
import { ClauseUnit, ComparisonChange } from './types';
import { numericDiff } from './numeric';

function tokens(text: string) { return new Set(normalizeQuery(text).split(/\s+/).filter(Boolean)); }
function similarity(a: string, b: string) { const left = tokens(a), right = tokens(b); const intersection = [...left].filter((token) => right.has(token)).length; return intersection / Math.max(1, new Set([...left, ...right]).size); }
function same(a: string, b: string) { return normalizeQuery(a) === normalizeQuery(b); }

export function alignClauses(oldUnits: ClauseUnit[], newUnits: ClauseUnit[]): ComparisonChange[] {
  const used = new Set<number>(); const changes: ComparisonChange[] = [];
  oldUnits.forEach((oldUnit, oldIndex) => {
    let best = -1; let bestScore = 0;
    newUnits.forEach((newUnit, newIndex) => { if (used.has(newIndex)) return; const refScore = oldUnit.ref && oldUnit.ref === newUnit.ref ? 1 : 0; const titleScore = oldUnit.title && newUnit.title && similarity(oldUnit.title, newUnit.title) >= 0.6 ? 0.25 : 0; const score = refScore + titleScore || similarity(oldUnit.text, newUnit.text); if (score > bestScore && (refScore > 0 || score >= 0.6)) { best = newIndex; bestScore = score; } });
    if (best < 0) { changes.push({ id: `removed-${oldIndex}`, type: 'removed', significance: 'high', category: 'clause', summary: 'Clause removed', oldText: oldUnit.text, oldPage: oldUnit.page, oldRef: oldUnit.ref, order: oldIndex }); return; }
    used.add(best); const next = newUnits[best]; const isSame = same(oldUnit.text, next.text); const moved = isSame && (oldIndex !== best || oldUnit.ref !== next.ref); const type = moved ? 'moved' : isSame ? 'unchanged' : 'modified';
    changes.push({ id: `${oldIndex}-${best}`, type, significance: type === 'unchanged' ? 'low' : 'medium', category: 'clause', summary: type === 'unchanged' ? 'No substantive change' : type === 'moved' ? 'Clause moved' : 'Clause modified', oldText: oldUnit.text, newText: next.text, oldPage: oldUnit.page, newPage: next.page, oldRef: oldUnit.ref, newRef: next.ref, numeric: type === 'modified' ? numericDiff(oldUnit.text, next.text) : [], order: oldIndex });
  });
  newUnits.forEach((unit, index) => { if (!used.has(index)) changes.push({ id: `added-${index}`, type: 'added', significance: 'high', category: 'clause', summary: 'Clause added', newText: unit.text, newPage: unit.page, newRef: unit.ref, order: oldUnits.length + index }); });
  return changes;
}