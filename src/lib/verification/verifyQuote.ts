import { normalizeQuery } from './normalize';

export interface DocRef {
  id: number;
  fullText: string;
  normText: string;
  map: number[];
  pages: { pageNo: number; start: number; end: number }[];
}

export interface VerifyResult {
  status: 'verified' | 'partial' | 'unverified';
  reason?: string;
  occurrences: { start: number; end: number; pageFrom: number; pageTo: number }[];
  matchedText?: string;
}

function findExact(normText: string, searchStr: string) {
  const matches = [];
  let idx = normText.indexOf(searchStr);
  while (idx !== -1) {
    matches.push({ start: idx, end: idx + searchStr.length });
    idx = normText.indexOf(searchStr, idx + 1); // overlapping allowed
  }
  return matches;
}

function findSequences(normText: string, segments: string[]): { start: number; end: number }[] {
  function search(segIdx: number, minStart: number): { start: number; end: number }[] {
    if (segIdx === segments.length) return [];
    const seg = segments[segIdx];
    const matches = findExact(normText.substring(minStart), seg).map(m => ({
      start: m.start + minStart,
      end: m.end + minStart
    }));

    if (segIdx === segments.length - 1) {
      return matches;
    }

    const results = [];
    for (const m of matches) {
      const nextSeqs = search(segIdx + 1, m.end);
      for (const n of nextSeqs) {
        results.push({ start: m.start, end: n.end });
      }
    }
    return results;
  }
  return search(0, 0);
}

export function verifyQuote(doc: DocRef, quote: string): VerifyResult {
  const quoteWords = quote.trim().split(/\s+/).filter(w => w.length > 0).length;
  if (quoteWords < 4) {
    return { status: 'unverified', reason: 'too short to verify', occurrences: [] };
  }

  const rawSegments = quote.split(/\.\.\.|…/).map(s => s.trim()).filter(s => s.length > 0);
  if (rawSegments.length > 1) {
    for (const seg of rawSegments) {
      if (seg.split(/\s+/).length < 3) {
        return { status: 'unverified', reason: 'ellipsis segment too short', occurrences: [] };
      }
    }
  }

  const normSegments = rawSegments.map(s => normalizeQuery(s));
  const isEllipsis = normSegments.length > 1;

  let occurrences: { start: number; end: number }[] = [];
  let status: 'verified' | 'partial' | 'unverified' = 'unverified';
  let reason: string | undefined;

  if (isEllipsis) {
    occurrences = findSequences(doc.normText, normSegments);
  } else {
    occurrences = findExact(doc.normText, normSegments[0]);
  }

  if (occurrences.length > 0) {
    status = 'verified';
  } else if (quoteWords >= 8 && !isEllipsis) {
    // Partial match fallback
    const normQuery = normSegments[0];
    const qWords = normQuery.split(' ').filter(w => w.length > 0);
    const docWords = doc.normText.split(' ');
    
    const wordStarts: number[] = [];
    let curr = 0;
    for (const w of docWords) {
      wordStarts.push(curr);
      curr += w.length + 1; // +1 for the space
    }

    let bestSim = 0;
    let bestWindow = null;

    for (let i = 0; i <= docWords.length - qWords.length; i++) {
      for (const wSize of [qWords.length - 1, qWords.length, qWords.length + 1]) {
        if (i + wSize > docWords.length) continue;
        const windowWords = docWords.slice(i, i + wSize);
        
        let matches = 0;
        const wMap = new Map<string, number>();
        for (const w of windowWords) wMap.set(w, (wMap.get(w) || 0) + 1);
        
        for (const qw of qWords) {
          if (wMap.has(qw) && wMap.get(qw)! > 0) {
            matches++;
            wMap.set(qw, wMap.get(qw)! - 1);
          }
        }
        
        const sim = matches / qWords.length;
        if (sim > bestSim) {
          bestSim = sim;
          bestWindow = { startIdx: i, endIdx: i + wSize - 1 };
        }
      }
    }

    if (bestSim >= 0.95 && bestWindow) {
      const normStart = wordStarts[bestWindow.startIdx];
      const lastWord = docWords[bestWindow.endIdx];
      const normEnd = wordStarts[bestWindow.endIdx] + lastWord.length;
      occurrences.push({ start: normStart, end: normEnd });
      status = 'partial';
      reason = `partial match (${(bestSim * 100).toFixed(1)}% similarity)`;
    } else {
      reason = 'not found or similarity too low';
    }
  } else {
    reason = isEllipsis ? 'ellipsis segments not found in order' : 'not found';
  }

  if (status === 'unverified') {
    return { status, reason, occurrences: [] };
  }

  // Map back to original text
  let matchedText: string | undefined;
  const mappedOccurrences = occurrences.map(occ => {
    // safely map to original indices
    const startIdx = Math.min(occ.start, doc.map.length - 1);
    const endIdx = Math.min(occ.end - 1, doc.map.length - 1); // occ.end is exclusive
    
    const origStart = doc.map[startIdx];
    const origEnd = doc.map[endIdx] + 1;
    
    if (!matchedText) {
      matchedText = doc.fullText.substring(origStart, origEnd);
    }

    let pageFrom = doc.pages[0]?.pageNo || 1;
    let pageTo = doc.pages[doc.pages.length - 1]?.pageNo || 1;

    for (const p of doc.pages) {
      if (origStart >= p.start && origStart < p.end) pageFrom = p.pageNo;
      if (origEnd - 1 >= p.start && origEnd - 1 < p.end) pageTo = p.pageNo;
    }

    return { start: origStart, end: origEnd, pageFrom, pageTo };
  });

  return { status, reason, occurrences: mappedOccurrences, matchedText };
}
