export type NumericSlot = { value: string; kind: string; index: number };
const patterns: Array<[string, RegExp]> = [
  ['money', /(?:AED|USD|EUR|INR|[$€£₹])\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion))?/gi],
  ['percentage', /\b\d+(?:\.\d+)?\s?%/g],
  ['duration', /\b\d+\s?(?:days?|months?|years?)\b/gi],
  ['date', /\b(?:\d{1,2}[/-]){2}\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g],
];
export function extractNumerics(text: string): NumericSlot[] { return patterns.flatMap(([kind, pattern]) => [...text.matchAll(pattern)].map((match, index) => ({ value: match[0], kind, index }))); }
export function numericDiff(oldText: string, newText: string) { const oldValues = extractNumerics(oldText); const newValues = extractNumerics(newText); const result = []; const length = Math.max(oldValues.length, newValues.length); for (let i = 0; i < length; i++) if (oldValues[i]?.value !== newValues[i]?.value) result.push({ old: oldValues[i]?.value || '(none)', new: newValues[i]?.value || '(none)', kind: newValues[i]?.kind || oldValues[i]?.kind || 'numeric' }); return result; }