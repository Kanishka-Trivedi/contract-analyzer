/**
 * Pure, server- and test-safe document processing utilities.
 * No DB or file-system imports. Exports: detectSections, chunkText, buildNormText.
 */

/** Detect section headings using common legal contract patterns */
export function detectSections(fullText: string): Array<{
  idx: number;
  number: string;
  title: string;
  start_offset: number;
  end_offset: number;
}> {
  const patterns: Array<{ regex: RegExp; numberGroup: number; titleGroup: number }> = [
    // 1.1.2 Title or 1. Title
    { regex: /^(\d+(?:\.\d+)*)\.\s+([A-Z][^\n]{0,80})/gm, numberGroup: 1, titleGroup: 2 },
    // 1.1 Title (no trailing dot)
    { regex: /^(\d+\.\d+(?:\.\d+)?)\s+([A-Z][^\n]{0,80})/gm, numberGroup: 1, titleGroup: 2 },
    // Article I, Article 1
    { regex: /^(Article\s+(?:[IVXivx]+|\d+))[.\s]+([^\n]{0,80})/gim, numberGroup: 1, titleGroup: 2 },
    // Section 1, Section 1.1
    { regex: /^(Section\s+\d+(?:\.\d+)*)[.\s]+([^\n]{0,80})/gim, numberGroup: 1, titleGroup: 2 },
    // CLAUSE N – Title (common in English law)
    { regex: /^(CLAUSE\s+\d+(?:\.\d+)*)[.\s–-]+([^\n]{0,80})/gim, numberGroup: 1, titleGroup: 2 },
    // ALL-CAPS heading (3+ words, letters only)
    { regex: /^([A-Z][A-Z\s]{5,60}[A-Z])$/gm, numberGroup: 1, titleGroup: 1 },
  ];

  const matches: Array<{ idx: number; number: string; title: string; start_offset: number; end_offset: number }> = [];

  for (const { regex, numberGroup, titleGroup } of patterns) {
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(fullText)) !== null) {
      const number = (match[numberGroup] || '').trim();
      const title  = (match[titleGroup]  || '').trim();
      const start_offset = match.index;
      const end_offset   = match.index + match[0].length;

      // Skip duplicates within 20 chars
      const isDuplicate = matches.some(m => Math.abs(m.start_offset - start_offset) < 20);
      if (!isDuplicate && title.length > 0) {
        matches.push({ idx: 0, number, title, start_offset, end_offset });
      }
    }
  }

  // Sort by position and re-index
  return matches
    .sort((a, b) => a.start_offset - b.start_offset)
    .map((m, i) => ({ ...m, idx: i }));
}

/** Section-aware chunker: ~1000 chars, ~12% overlap, preserves absolute offsets */
export function chunkText(
  fullText: string,
  chunkSize = 1000,
  overlapFraction = 0.12
): Array<{ idx: number; text: string; start_offset: number; end_offset: number }> {
  if (fullText.length === 0) return [];

  const overlap = Math.floor(chunkSize * overlapFraction);
  const step    = chunkSize - overlap;
  const chunks: Array<{ idx: number; text: string; start_offset: number; end_offset: number }> = [];

  let offset = 0;
  let idx    = 0;

  while (offset < fullText.length) {
    let end = Math.min(offset + chunkSize, fullText.length);

    // Try to break at paragraph / sentence boundary within next +200 chars
    if (end < fullText.length) {
      const searchWindow = Math.min(end + 200, fullText.length);
      const paraBreak    = fullText.lastIndexOf('\n', searchWindow);
      if (paraBreak > offset + step) {
        end = paraBreak + 1;
      } else {
        const sentBreak = fullText.lastIndexOf('. ', searchWindow);
        if (sentBreak > offset + step) end = sentBreak + 2;
      }
    }

    const text = fullText.slice(offset, end);
    chunks.push({ idx: idx++, text, start_offset: offset, end_offset: end });

    if (end >= fullText.length) break;
    offset = offset + step;
    if (offset >= end) offset = end; // safety – guarantee forward progress
  }

  return chunks;
}

/**
 * Build a normalised version of fullText for the quote verifier.
 * Matching must be done case-insensitively with the same transforms applied.
 */
export function buildNormText(text: string): string {
  return text
    .normalize('NFKC')
    // Curly/typographic quotes → straight
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    // En/em/figure dashes, non-breaking hyphen → hyphen
    .replace(/[\u2013\u2014\u2012\u2011\u2015]/g, '-')
    // Soft hyphen → removed
    .replace(/\u00AD/g, '')
    // Zero-width chars
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    // Ligatures
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    // Join words hyphenated across line breaks ("termi-\nnation" → "termination")
    .replace(/(\w+)-\n(\w+)/g, '$1$2')
    // Collapse all whitespace (spaces, newlines, tabs) → single space
    .replace(/\s+/g, ' ')
    // Lowercase
    .toLowerCase()
    .trim();
}
