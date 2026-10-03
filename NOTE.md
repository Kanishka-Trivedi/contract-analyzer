# Submission note

## How quote verification works, and where it can fail

The model must write every quote as `<quote doc="ID">exact text</quote>`. My code never trusts any position, page or offset the model reports. Instead, each document has a normalised copy of its text plus an offset map back to the original. Normalisation covers Unicode NFKC, curly quotes, dash variants, ligatures, soft hyphens, words hyphenated across line breaks, all whitespace (spaces, tabs, newlines, non-breaking spaces) and case. The quote is normalised the same way and searched for in the document. A hit is mapped back to original offsets and page numbers, and every occurrence is kept. Near matches (8 or more words, at least 95% token similarity) are shown as "close match" with the real document text. Everything else is unverified: struck through, grouped separately, and not clickable. In multi-document mode a quote is checked only against the document it names. Figures in the answer prose are also cross-checked against the verified quotes.

It can fail in these ways:
- Text extraction can scramble reading order (tables, headers and footers), so a genuine quote may not be found.
- OCR-garbled text will not match what the model reads.
- Normalisation could, in theory, merge two distinct strings.
- Quotes under 4 words are rejected as too short to verify meaningfully.
- Highlighting depends on the PDF text layer matching the extracted text. If the exact passage can't be pinpointed, the viewer scrolls to the page and says so.

## How I handled large documents

The document is never sent whole. It is split into section-aware chunks with full-text and trigram search, and the model reads only what it needs through tools. The code records every page a tool actually returned and shows "Read N of M pages" per document. If coverage is incomplete, the model must say it did not find the clause in the sections it searched, and it must never say a clause does not exist. I tested this with a generated 150-page contract that has a clause on page 140.

## Part C: Option 2 (agentic research)

I chose Option 2 because it builds on the same retrieval and verification layers, and because it prevents the failure the brief calls worst, claiming a clause is absent after reading only part of a document. I finished it: a multi-round loop with `list_clauses`, `get_section`, `search_document` and `read_pages`, hard caps of 8 rounds and 20 tool calls, a live activity timeline, and structured errors for malformed or invented tool calls instead of crashes. The hardest part was provider behaviour. Gemini 3 requires a thought signature to be echoed back with each tool call, and with two documents it sends parallel calls whose streamed arguments arrive merged, which broke JSON parsing until I split them properly. Keeping the coverage numbers honest (pages actually read, not sections matched) was the second hardest.

## What I would build next

- Tracked-change redlining (Option 1), once the agent loop is stable.
- OCR for scanned PDFs, instead of rejecting them.
- Embeddings for semantic retrieval alongside the keyword search.
- Browser-level end-to-end tests for the cross-page and duplicate-quote highlight cases, which are currently covered mostly by unit tests.
- Export of an answer with its verified quotes to PDF or Word.