export type ClauseUnit = { ref: string; title: string; text: string; page: number; start: number; end: number; index: number };
export type NumericChange = { old: string; new: string; kind: string };
export type ComparisonChange = {
  id: string; type: 'unchanged' | 'modified' | 'added' | 'removed' | 'moved';
  significance: 'critical' | 'high' | 'medium' | 'low' | 'cosmetic'; category: string;
  summary: string; oldText?: string; newText?: string; oldPage?: number; newPage?: number;
  oldRef?: string; newRef?: string; numeric?: NumericChange[]; oldQuote?: unknown; newQuote?: unknown; order: number; aiError?: boolean;
};