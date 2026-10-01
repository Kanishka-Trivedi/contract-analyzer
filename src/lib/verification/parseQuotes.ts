import { verifyQuote, DocRef, VerifyResult } from './verifyQuote';

export interface ParsedQuote {
  docId?: string;
  text: string;
  start: number;
  end: number;
}

export interface VerifiedParsedQuote extends ParsedQuote, Omit<VerifyResult, 'status'> {
  status: 'verified' | 'partial' | 'unverified';
}

export function extractQuotes(text: string): ParsedQuote[] {
  const quotes: ParsedQuote[] = [];
  // Match <quote doc="ID">...</quote>
  // Tolerant to whitespace, single/no quotes, missing doc, and unclosed tags at the end of the text
  const regex = /<quote(?:\s+doc=['"]?([^'">\s]+)['"]?)?\s*>([\s\S]*?)(?:<\/quote>|$)/g;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    quotes.push({
      docId: match[1],
      text: match[2],
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return quotes;
}

export function verifyAnswerQuotes(answerText: string, docsById: Record<string, DocRef>): VerifiedParsedQuote[] {
  const quotes = extractQuotes(answerText);
  return quotes.map(q => {
    if (!q.docId) {
      return { ...q, status: 'unverified', reason: 'missing doc attribute', occurrences: [] };
    }
    const doc = docsById[q.docId];
    if (!doc) {
      return { ...q, status: 'unverified', reason: `unknown document ID: ${q.docId}`, occurrences: [] };
    }
    const result = verifyQuote(doc, q.text);
    return { ...q, ...result };
  });
}
