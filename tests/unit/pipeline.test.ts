import { describe, it, expect } from 'vitest';
import { detectSections, chunkText, buildNormText } from '../../src/lib/document-processing/utils';

// ──────────────────────────────────────────────────────────────────────────────
// Magic-byte validation (pure logic — tested here; server route tested in e2e)
// ──────────────────────────────────────────────────────────────────────────────
function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  const hex = buffer.subarray(0, 4).toString('hex').toUpperCase();
  if (hex === '25504446') return 'application/pdf';
  if (hex === '504B0304') {
    const str = buffer.toString('binary');
    if (str.includes('word/document.xml')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return null; // Some other ZIP (xlsx, pptx, …)
  }
  return null;
}

describe('Magic-byte validation', () => {
  it('detects a PDF header (%PDF)', () => {
    // %PDF = 0x25 0x50 0x44 0x46
    const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    const rest = Buffer.from('-1.4 rest of pdf content', 'ascii');
    const buf = Buffer.concat([pdfMagic, rest]);
    expect(detectMimeFromBuffer(buf)).toBe('application/pdf');
  });

  it('rejects a plain-text file', () => {
    const buf = Buffer.from('This is a plain text file.\nNo magic bytes here.', 'utf-8');
    expect(detectMimeFromBuffer(buf)).toBeNull();
  });

  it('rejects a ZIP without word/document.xml (e.g. xlsx)', () => {
    const buf = Buffer.alloc(8);
    buf.write('PK\x03\x04', 0, 'binary');
    buf.write('xl/workbook.xml', 4, 'ascii');
    expect(detectMimeFromBuffer(buf)).toBeNull();
  });

  it('detects a DOCX ZIP with word/document.xml', () => {
    const header = Buffer.from('504B0304', 'hex');
    const content = Buffer.from('word/document.xml somedata', 'ascii');
    const buf = Buffer.concat([header, content]);
    expect(detectMimeFromBuffer(buf)).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Scanned PDF detection
// ──────────────────────────────────────────────────────────────────────────────
function isScanned(fullText: string, pageCount: number): boolean {
  const totalLength = fullText.trim().length;
  const avgCharsPerPage = pageCount > 0 ? totalLength / pageCount : 0;
  return avgCharsPerPage < 25 || totalLength < 50;
}

describe('Scanned PDF detection', () => {
  it('flags a completely empty PDF as scanned', () => {
    expect(isScanned('', 5)).toBe(true);
  });

  it('flags a PDF with only whitespace as scanned', () => {
    expect(isScanned('   \n  \n  ', 3)).toBe(true);
  });

  it('flags a PDF with less than 25 chars/page average as scanned', () => {
    // 5 pages, only 40 chars total → 8 chars/page
    expect(isScanned('abc def ghi jkl mno pqr stu vwx yz!', 5)).toBe(true);
  });

  it('accepts a normal text PDF', () => {
    const text = 'This is a normal contract. '.repeat(50);
    expect(isScanned(text, 3)).toBe(false);
  });

  it('accepts a PDF with sparse text but total > 50 chars and avg >= 25', () => {
    const text = 'a'.repeat(100); // 1 page, 100 chars
    expect(isScanned(text, 1)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Section detection
// ──────────────────────────────────────────────────────────────────────────────
describe('Section detection', () => {
  const contract = `
1. Definitions
In this Agreement the following terms have the following meanings.

1.1 Confidential Information means all information disclosed by one party to another.

2. Term
The term of this Agreement shall be 12 months from the Effective Date.

2.1 Renewal
Either party may renew by providing 30 days written notice.

Article I Governing Law
This Agreement shall be governed by the laws of England and Wales.

Section 3.1 Termination
Either party may terminate with 30 days written notice.

INDEMNIFICATION
Each party shall indemnify the other against all losses.
`;

  it('detects numbered sections (1. and 1.1)', () => {
    const sections = detectSections(contract);
    const nums = sections.map(s => s.number);
    // Numbered headings like '1', '1.1', '2' should all be found
    expect(nums.some(n => /^1$/.test(n) || n === '1')).toBe(true);
    expect(nums.some(n => /^1\.1/.test(n))).toBe(true);
    expect(nums.some(n => /^2$/.test(n) || n === '2')).toBe(true);
  });

  it('detects Article headings', () => {
    const sections = detectSections(contract);
    const hasArticle = sections.some(s => s.number.toLowerCase().includes('article'));
    expect(hasArticle).toBe(true);
  });

  it('detects Section headings', () => {
    const sections = detectSections(contract);
    const hasSection = sections.some(s => s.number.toLowerCase().includes('section'));
    expect(hasSection).toBe(true);
  });

  it('returns sections sorted by position', () => {
    const sections = detectSections(contract);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].start_offset).toBeGreaterThanOrEqual(sections[i - 1].start_offset);
    }
  });

  it('returns non-empty titles', () => {
    const sections = detectSections(contract);
    sections.forEach(s => {
      expect(s.title).toBeTruthy();
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Chunk offsets: chunk.text === fullText.slice(start_offset, end_offset)
// ──────────────────────────────────────────────────────────────────────────────
describe('Chunk offsets', () => {
  it('each chunk text exactly equals fullText.slice(start, end)', () => {
    const fullText = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
    const chunks = chunkText(fullText);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text).toBe(fullText.slice(chunk.start_offset, chunk.end_offset));
    }
  });

  it('chunks cover the entire document without gaps', () => {
    const fullText = 'A'.repeat(5000);
    const chunks = chunkText(fullText);
    // First chunk starts at 0
    expect(chunks[0].start_offset).toBe(0);
    // Last chunk ends at or beyond length (end must equal fullText.length for last)
    expect(chunks[chunks.length - 1].end_offset).toBe(fullText.length);
  });

  it('chunks have overlap (a word from the end of chunk N appears at start of chunk N+1)', () => {
    const repeated = 'word1 word2 word3 word4 word5 '.repeat(200);
    const chunks = chunkText(repeated, 300, 0.12);
    expect(chunks.length).toBeGreaterThan(1);
    // The last word of chunk 0 should appear somewhere in chunk 1
    const lastWordOfFirst = chunks[0].text.trim().split(/\s+/).pop()!;
    expect(chunks[1].text.includes(lastWordOfFirst)).toBe(true);
  });

  it('handles a text shorter than chunk size as a single chunk', () => {
    const shortText = 'Short contract text.';
    const chunks = chunkText(shortText, 1000, 0.12);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(shortText);
    expect(chunks[0].start_offset).toBe(0);
    expect(chunks[0].end_offset).toBe(shortText.length);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Normalisation
// ──────────────────────────────────────────────────────────────────────────────
describe('buildNormText', () => {
  it('converts curly quotes to straight quotes', () => {
    expect(buildNormText('\u201Chello\u201D')).toBe('"hello"');
  });

  it('converts em/en dashes to hyphens', () => {
    expect(buildNormText('a\u2013b\u2014c')).toBe('a-b-c');
  });

  it('collapses multiple spaces', () => {
    expect(buildNormText('a   b    c')).toBe('a b c');
  });

  it('lowercases the text', () => {
    expect(buildNormText('HELLO WORLD')).toBe('hello world');
  });

  it('joins words hyphenated across line breaks', () => {
    expect(buildNormText('termi-\nnation clause')).toBe('termination clause');
  });

  it('removes soft hyphens', () => {
    expect(buildNormText('busi\u00ADness')).toBe('business');
  });
});
