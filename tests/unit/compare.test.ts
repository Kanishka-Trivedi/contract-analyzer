import { describe, expect, it } from 'vitest';
import { alignClauses } from '../../src/lib/compare/align';
import { extractNumerics, numericDiff } from '../../src/lib/compare/numeric';
import { applySignificanceFloor } from '../../src/lib/compare/classify';

const unit = (ref: string, text: string, index: number) => ({ ref, title: ref, text, page: index + 1, start: 0, end: text.length, index });

describe('lean document comparison', () => {
  it('classifies modified, added, and removed units', () => {
    const changes = alignClauses([unit('1', 'Payment is due in 30 days.', 0), unit('2', 'The cap is AED 100,000.', 1)], [unit('1', 'Payment is due in 60 days.', 0), unit('3', 'New confidentiality clause.', 1)]);
    expect(changes.map((change) => change.type)).toEqual(['modified', 'removed', 'added']);
  });
  it('extracts and diffs money, durations, percentages, and dates', () => {
    expect(extractNumerics('AED 100,000, 30 days, 5%, 2025-01-01')).toHaveLength(4);
    expect(numericDiff('AED 100,000 and 30 days', 'AED 1,000,000 and 60 days')).toEqual([{ old: 'AED 100,000', new: 'AED 1,000,000', kind: 'money' }, { old: '30 days', new: '60 days', kind: 'duration' }]);
  });
  it('never lowers the significance floor for numeric changes', () => {
    const change = { id: 'x', type: 'modified' as const, significance: 'medium' as const, category: 'clause', summary: 'Changed', oldText: 'AED 100,000', newText: 'AED 1,000,000', numeric: [{ old: 'AED 100,000', new: 'AED 1,000,000', kind: 'money' }], order: 0 };
    expect(applySignificanceFloor(change, 'cosmetic').significance).toBe('high');
  });
  it('treats identical text at different position as moved', () => {
    const changes = alignClauses([unit('1', 'Same clause text.', 0), unit('2', 'Another clause.', 1)], [unit('1', 'Another clause.', 0), unit('2', 'Same clause text.', 1)]);
    const moved = changes.find(c => c.type === 'moved');
    expect(moved).toBeDefined();
    expect(moved?.oldText).toBe('Same clause text.');
  });
  it('treats low-similarity clause as removed/added not moved', () => {
    const changes = alignClauses([unit('1', 'Completely different text here.', 0)], [unit('1', 'Nothing alike at all.', 0)]);
    expect(changes.map(c => c.type)).toEqual(['removed', 'added']);
  });
  it('never lowers the significance floor for numeric changes', () => {
    const change = { id: 'x', type: 'modified' as const, significance: 'medium' as const, category: 'clause', summary: 'Changed', oldText: 'AED 100,000', newText: 'AED 1,000,000', numeric: [{ old: 'AED 100,000', new: 'AED 1,000,000', kind: 'money' }], order: 0 };
    expect(applySignificanceFloor(change, 'cosmetic').significance).toBe('high');
  });
  it('significance safety: semantic meaning changes (sim < 0.9) are bumped to high if LLM tries to make it medium/low', () => {
    const change = { id: 'x', type: 'modified' as const, significance: 'medium' as const, category: 'liability', summary: 'Liability cap changed', oldText: 'Cap is AED 100,000', newText: 'Unlimited liability', numeric: [], order: 0 };
    expect(applySignificanceFloor(change, 'medium').significance).toBe('high');
  });
  it('allows cosmetic for reworded termination clause without numeric changes (sim > 0.9 or LLM says cosmetic)', () => {
    // If LLM says cosmetic, semanticChange is false, so it allows it.
    const change = { id: 'x', type: 'modified' as const, significance: 'cosmetic' as const, category: 'termination', summary: 'Reworded termination', oldText: 'Either party may terminate', newText: 'Any party can terminate', numeric: [], order: 0 };
    expect(applySignificanceFloor(change, 'cosmetic').significance).toBe('cosmetic');
  });
});