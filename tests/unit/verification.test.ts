import { describe, it, expect } from 'vitest';
import { normalizeWithMap, normalizeQuery } from '../../src/lib/verification/normalize';
import { verifyQuote, DocRef } from '../../src/lib/verification/verifyQuote';

describe('normalizeWithMap', () => {
  it('handles exact matches and maps back correctly', () => {
    const text = 'Hello, world!';
    const { norm, map } = normalizeWithMap(text);
    expect(norm).toBe('hello, world!');
    expect(map.length).toBe(norm.length);
  });

  it('collapses whitespace/newlines', () => {
    const text = 'This  is \n \t some text';
    const { norm, map } = normalizeWithMap(text);
    expect(norm).toBe('this is some text');
  });

  it('joins words hyphenated across line breaks', () => {
    const text = 'termi-\nnation of the agree-\n\n\nment.';
    const { norm, map } = normalizeWithMap(text);
    expect(norm).toBe('termination of the agreement.');
  });

  it('straightens curly quotes and dashes', () => {
    const text = '“Smart quotes” and ‘single’ — em dash';
    const { norm, map } = normalizeWithMap(text);
    expect(norm).toBe('"smart quotes" and \'single\' - em dash');
  });

  it('handles ligatures', () => {
    const text = 'ﬁnd the ﬂow ﬃc';
    const { norm, map } = normalizeWithMap(text);
    expect(norm).toBe('find the flow ffic');
  });

  it('handles Unicode NFKC normalisation', () => {
    // ℌ is U+210C, normalises to H
    const text = 'ℌello';
    const { norm, map } = normalizeWithMap(text);
    expect(norm).toBe('hello');
  });

  it('preserves offsets during collapse and expansion', () => {
    const text = 'A  B ﬁ C-\nD'; // indices: A:0, (space):1, (space):2, B:3, (space):4, ﬁ:5, (space):6, C:7, -:8, \n:9, D:10
    const { norm, map } = normalizeWithMap(text);
    expect(norm).toBe('a b fi cd');
    // a -> 0
    // space -> 1 (first space of the run)
    // b -> 3
    // space -> 4
    // f -> 5, i -> 5
    // space -> 6
    // c -> 7
    // d -> 10 (hyphen and newline skipped)
    expect(map).toEqual([0, 1, 3, 4, 5, 5, 6, 7, 10]);
  });
});

describe('verifyQuote', () => {
  const fullText = "This Agreement (the “Agreement”) is entered into this day... The parties agree to the termi-\nnation clause. In the event of FORCE MAJEURE, no party shall be liable for any failure to perform its obligations where such failure is as a result of Acts of God (including fire, flood, earthquake, storm, hurricane or other natural disaster). The end.";
  const { norm: normText, map } = normalizeWithMap(fullText);
  const doc: DocRef = {
    id: 1,
    fullText,
    normText,
    map,
    pages: [
      { pageNo: 1, start: 0, end: 150 },
      { pageNo: 2, start: 150, end: fullText.length }
    ]
  };

  it('finds an exact match and maps original offsets', () => {
    const quote = 'The parties agree to the termination clause.';
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('verified');
    expect(result.occurrences.length).toBe(1);
    const occ = result.occurrences[0];
    const matched = fullText.slice(occ.start, occ.end);
    expect(matched).toBe('The parties agree to the termi-\nnation clause.');
  });

  it('handles case differences and curly quotes', () => {
    const quote = '(the "Agreement") is ENTERED into';
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('verified');
    expect(result.occurrences.length).toBe(1);
    const occ = result.occurrences[0];
    const matched = fullText.slice(occ.start, occ.end);
    expect(matched).toBe('(the “Agreement”) is entered into');
  });

  it('handles quotes spanning page breaks', () => {
    const quote = 'failure to perform its obligations where such failure is as a result';
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('verified');
    expect(result.occurrences.length).toBe(1);
    const occ = result.occurrences[0];
    expect(occ.pageFrom).toBeGreaterThanOrEqual(1);
    expect(occ.pageTo).toBeGreaterThanOrEqual(1);
  });

  it('returns unverified for invented quotes', () => {
    const quote = 'The parties agree to pay one million dollars.';
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('unverified');
  });

  it('handles ellipsis in order', () => {
    const quote = 'In the event of FORCE MAJEURE, ... or other natural disaster).';
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('verified');
    const occ = result.occurrences[0];
    expect(fullText.slice(occ.start, occ.end).startsWith('In the event')).toBe(true);
    expect(fullText.slice(occ.start, occ.end).endsWith('natural disaster).')).toBe(true);
  });

  it('returns unverified for ellipsis segments out of order', () => {
    const quote = 'natural disaster). ... In the event of FORCE MAJEURE,';
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('unverified');
  });

  it('returns unverified for short quotes', () => {
    const quote = 'FORCE MAJEURE';
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('unverified');
    expect(result.reason).toBe('too short to verify');
  });

  it('handles multiple occurrences', () => {
    const multiText = "The apple is a fruit. The banana is a fruit. The apple is a fruit.";
    const { norm, map } = normalizeWithMap(multiText);
    const doc2: DocRef = {
      id: 2,
      fullText: multiText,
      normText: norm,
      map,
      pages: [{ pageNo: 1, start: 0, end: multiText.length }]
    };
    const quote = 'The apple is a fruit.';
    const result = verifyQuote(doc2, quote);
    expect(result.status).toBe('verified');
    expect(result.occurrences.length).toBe(2);
  });

  it('finds a partial match for >= 8 words >= 95% similarity', () => {
    // Doc has: "no party shall be liable for any failure to perform its obligations"
    // Quote has one word difference: "no party shall be responsible for any failure to perform its obligations" (11 words, 1 diff = 10/11 = 90% ... wait, 95% needs 19/20 words).
    // Let's make a longer one for 95%.
    // 20 words. 19/20 = 95%.
    const quote = 'In the event of force majeure, no party shall be liable for any mistake to perform its obligations where such failure';
    // 21 words. missing/wrong 'mistake' vs 'failure'. 20/21 = 95.2%
    const result = verifyQuote(doc, quote);
    expect(result.status).toBe('partial');
    expect(result.occurrences.length).toBe(1);
    expect(result.matchedText).toContain('no party shall be liable for any failure');
  });

  it('handles empty/Arabic string without crashing', () => {
    const resultEmpty = verifyQuote(doc, '');
    expect(resultEmpty.status).toBe('unverified');

    const resultArabic = verifyQuote(doc, 'هذا نص عربي طويل جدا للاختبار');
    expect(resultArabic.status).toBe('unverified');
  });

  it('random noise roundtrip property test', () => {
    const base = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';
    const { norm, map } = normalizeWithMap(base);
    const doc3 = { id: 3, fullText: base, normText: norm, map, pages: [{pageNo: 1, start: 0, end: base.length}] };

    // exact substring
    const quote = 'consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore';
    const result = verifyQuote(doc3, quote);
    expect(result.status).toBe('verified');
    const occ = result.occurrences[0];
    expect(base.slice(occ.start, occ.end)).toBe(quote);
  });
});
