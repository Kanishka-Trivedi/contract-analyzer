import { normalizeQuery, normalizeWithMap } from '@/lib/verification/normalize';

export type TextSpan = { text: string; start: number; end: number };
export type SpanRange = { spanIndex: number; start: number; end: number };

export function mapNormalizedMatchToSpans(
  spans: TextSpan[],
  quote: string,
  occurrenceIndex = 0,
): SpanRange[] | null {
  const raw = spans.map((span) => span.text).join('');
  const normalized = normalizeWithMap(raw);
  const target = normalizeQuery(quote);
  if (!target) return null;
  let matchStart = -1;
  let cursor = 0;
  for (let occurrence = 0; occurrence <= occurrenceIndex; occurrence++) {
    matchStart = normalized.norm.indexOf(target, cursor);
    if (matchStart < 0) return null;
    cursor = matchStart + 1;
  }
  const rawStart = normalized.map[matchStart];
  const rawEnd = normalized.map[matchStart + target.length - 1] + 1;
  if (rawStart === undefined || rawEnd === undefined) return null;
  const ranges: SpanRange[] = [];
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const start = Math.max(rawStart, span.start);
    const end = Math.min(rawEnd, span.end);
    if (start < end) ranges.push({ spanIndex: index, start: start - span.start, end: end - span.start });
  }
  return ranges.length > 0 ? ranges : null;
}