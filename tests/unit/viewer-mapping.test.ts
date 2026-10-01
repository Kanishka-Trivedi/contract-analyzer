import { describe, expect, it } from 'vitest';
import { mapNormalizedMatchToSpans } from '../../src/components/viewer/mapping';

describe('viewer citation mapping', () => {
  it('maps a quote split over three spans', () => {
    const result = mapNormalizedMatchToSpans([
      { text: 'The parties ', start: 0, end: 12 },
      { text: 'agree to comply ', start: 12, end: 28 },
      { text: 'with this Agreement.', start: 28, end: 48 },
    ], 'the parties agree to comply with this agreement.');
    expect(result).toEqual([
      { spanIndex: 0, start: 0, end: 12 },
      { spanIndex: 1, start: 0, end: 16 },
      { spanIndex: 2, start: 0, end: 20 },
    ]);
  });

  it('matches different whitespace using verifier normalization', () => {
    const result = mapNormalizedMatchToSpans([
      { text: 'The   parties\nagree', start: 0, end: 19 },
    ], 'the parties agree');
    expect(result).toEqual([{ spanIndex: 0, start: 0, end: 19 }]);
  });

  it('selects the requested duplicate occurrence', () => {
    const spans = [{ text: 'The same clause. The same clause.', start: 0, end: 33 }];
    expect(mapNormalizedMatchToSpans(spans, 'The same clause.', 0)).toEqual([{ spanIndex: 0, start: 0, end: 16 }]);
    expect(mapNormalizedMatchToSpans(spans, 'The same clause.', 1)).toEqual([{ spanIndex: 0, start: 17, end: 33 }]);
  });
});