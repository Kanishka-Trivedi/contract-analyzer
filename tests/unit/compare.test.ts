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
});