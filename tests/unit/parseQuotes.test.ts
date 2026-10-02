import { describe, it, expect } from 'vitest';
import { verifyAnswerQuotes, extractQuotes } from '../../src/lib/verification/parseQuotes';
import { normalizeWithMap } from '../../src/lib/verification/normalize';
import { DocRef } from '../../src/lib/verification/verifyQuote';

describe('parseQuotes', () => {
  const docAText = 'This is the contract for document A. The liability cap is ten thousand dollars.';
  const { norm: normA, map: mapA } = normalizeWithMap(docAText);
  const docA: DocRef = {
    id: 1,
    fullText: docAText,
    normText: normA,
    map: mapA,
    pages: [{ pageNo: 1, start: 0, end: docAText.length }]
  };

  const docBText = 'This is the contract for document B. The liability cap is one million dollars.';
  const { norm: normB, map: mapB } = normalizeWithMap(docBText);
  const docB: DocRef = {
    id: 2,
    fullText: docBText,
    normText: normB,
    map: mapB,
    pages: [{ pageNo: 1, start: 0, end: docBText.length }]
  };

  const docsById = { '1': docA, '2': docB };

  it('a quote that exists only in doc B but is attributed to doc A is unverified', () => {
    // "The liability cap is one million dollars." exists in B but we attribute to A
    const answer = 'Here is the quote: <quote doc="1">The liability cap is one million dollars.</quote>';
    const result = verifyAnswerQuotes(answer, docsById);
    expect(result.length).toBe(1);
    expect(result[0].status).toBe('unverified');
    expect(result[0].docId).toBe('1');
  });

  it('an LLM_MOCK two-document answer where each quote verifies against its own document', () => {
    const answer = `Comparing the two documents:
Doc A says <quote doc="1">The liability cap is ten thousand dollars.</quote>
Whereas Doc B says <quote doc="2">The liability cap is one million dollars.</quote>`;
    
    const result = verifyAnswerQuotes(answer, docsById);
    expect(result.length).toBe(2);
    
    expect(result[0].status).toBe('verified');
    expect(result[0].docId).toBe('1');
    expect(result[0].text).toBe('The liability cap is ten thousand dollars.');
    
    expect(result[1].status).toBe('verified');
    expect(result[1].docId).toBe('2');
    expect(result[1].text).toBe('The liability cap is one million dollars.');
  });
});
