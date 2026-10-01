import { db } from '@/lib/db';
import { documents, pages as pagesTable, chunks as chunksTable, sections as sectionsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import mammoth from 'mammoth';
import { detectSections, chunkText, buildNormText } from './utils';

// We use the legacy build with no-worker mode for Node.js server-side extraction
// pdfjs-dist must run in server context only - never imported on client
async function extractPDFText(buffer: Buffer): Promise<{
  pages: Array<{ pageNo: number; text: string }>;
  pageCount: number;
}> {
  // Dynamically import to avoid webpack bundling issues on client
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  // Disable worker for server-side Node.js usage
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useWorkerFetch: false,
    useSystemFonts: true,
    disableFontFace: true,
    // This is the key option that makes pdfjs work without a worker in Node
    disableRange: false,
    disableStream: false,
  });

  const pdfDocument = await loadingTask.promise;
  const pageCount: number = pdfDocument.numPages;
  const pages: Array<{ pageNo: number; text: string }> = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{ str: string; hasEOL?: boolean }>;
    let pageText = '';
    for (const item of items) {
      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
      else pageText += ' ';
    }
    pageText = pageText.replace(/ +/g, ' ').trimEnd() + '\n';
    pages.push({ pageNo: i, text: pageText });
  }

  return { pages, pageCount };
}




export async function processDocumentPipeline(docId: number, buffer: Buffer, mime: string) {
  try {
    await db.update(documents).set({
      status: 'extracting',
      progress_pct: 5,
      status_message: 'Starting extraction...'
    }).where(eq(documents.id, docId));

    let fullText = '';
    let pageCount = 0;
    const pageRecords: Array<{
      doc_id: number; page_no: number; text: string; start_offset: number; end_offset: number;
    }> = [];

    const isPDF = mime === 'application/pdf' || mime.includes('pdf') ||
      buffer.subarray(0, 4).toString('ascii') === '%PDF';

    if (isPDF) {
      try {
        const { pages, pageCount: pc } = await extractPDFText(buffer);
        pageCount = pc;
        let currentOffset = 0;

        for (const p of pages) {
          await db.update(documents).set({
            status_message: `Extracting text, page ${p.pageNo} of ${pageCount}`,
            progress_pct: 5 + Math.floor((p.pageNo / pageCount) * 40)
          }).where(eq(documents.id, docId));

          const start_offset = currentOffset;
          const end_offset = start_offset + p.text.length;
          pageRecords.push({ doc_id: docId, page_no: p.pageNo, text: p.text, start_offset, end_offset });
          fullText += p.text;
          currentOffset += p.text.length;
        }
      } catch (pdfErr) {
        const errMsg = pdfErr instanceof Error ? pdfErr.message : 'Unknown PDF error';
        // Possibly encrypted or corrupt
        if (errMsg.includes('Password') || errMsg.includes('encrypted')) {
          await db.update(documents).set({
            status: 'failed',
            error_code: 'ENCRYPTED',
            status_message: 'This PDF is password-protected. Please upload an unprotected document.'
          }).where(eq(documents.id, docId));
          return;
        }
        throw pdfErr; // re-throw; outer catch handles it
      }

      // Scanned PDF detection
      const totalLength = fullText.trim().length;
      const avgCharsPerPage = pageCount > 0 ? totalLength / pageCount : 0;
      if (avgCharsPerPage < 25 || totalLength < 50) {
        await db.update(documents).set({
          status: 'failed',
          error_code: 'NO_TEXT',
          status_message:
            'This PDF appears to be scanned images with no readable text. OCR is not supported. Please upload a text-based PDF.'
        }).where(eq(documents.id, docId));
        return;
      }
    } else {
      // DOCX via mammoth
      await db.update(documents).set({
        status_message: 'Extracting DOCX text...',
        progress_pct: 20
      }).where(eq(documents.id, docId));

      const result = await mammoth.extractRawText({ buffer });
      fullText = result.value || '';
      if (!fullText.trim()) {
        await db.update(documents).set({
          status: 'failed',
          error_code: 'NO_TEXT',
          status_message: 'No readable text could be extracted from this DOCX file.'
        }).where(eq(documents.id, docId));
        return;
      }

      // Approximate pages by 3000 chars per page
      const approxPages = Math.max(1, Math.ceil(fullText.length / 3000));
      pageCount = approxPages;
      const charsPerPage = Math.ceil(fullText.length / approxPages);
      let offset = 0;
      for (let i = 0; i < approxPages; i++) {
        const end = Math.min(offset + charsPerPage, fullText.length);
        const text = fullText.slice(offset, end);
        pageRecords.push({
          doc_id: docId, page_no: i + 1,
          text, start_offset: offset, end_offset: end
        });
        offset = end;
      }
    }

    // Insert pages in batch
    if (pageRecords.length > 0) {
      // Insert in batches of 50 to avoid huge query
      for (let i = 0; i < pageRecords.length; i += 50) {
        await db.insert(pagesTable).values(pageRecords.slice(i, i + 50));
      }
    }

    const { normalizeWithMap } = await import('../verification/normalize');
    const { norm: normText, map: normMap } = normalizeWithMap(fullText);

    await db.update(documents).set({
      full_text: fullText,
      norm_text: normText,
      norm_map: normMap,
      status: 'indexing',
      status_message: 'Detecting sections...',
      progress_pct: 55
    }).where(eq(documents.id, docId));

    // Section detection
    const detectedSections = detectSections(fullText);

    // Map sections to page numbers using pageRecords
    const getSectionPages = (startOff: number, endOff: number) => {
      let pageFrom = 1, pageTo = 1;
      for (const pr of pageRecords) {
        if (pr.start_offset <= startOff && startOff < pr.end_offset) pageFrom = pr.page_no;
        if (pr.start_offset <= endOff && endOff <= pr.end_offset) pageTo = pr.page_no;
      }
      return { pageFrom, pageTo };
    };

    if (detectedSections.length > 0) {
      // For each section, the end is the start of the next section (or end of fullText)
      const sectionRecords = detectedSections.map((s, i) => {
        const nextStart = i + 1 < detectedSections.length
          ? detectedSections[i + 1].start_offset
          : fullText.length;
        const { pageFrom, pageTo } = getSectionPages(s.start_offset, nextStart);
        return {
          doc_id: docId,
          idx: s.idx,
          number: s.number || null,
          title: s.title || null,
          start_offset: s.start_offset,
          end_offset: nextStart,
          page_from: pageFrom,
          page_to: pageTo,
        };
      });
      for (let i = 0; i < sectionRecords.length; i += 50) {
        await db.insert(sectionsTable).values(sectionRecords.slice(i, i + 50));
      }
    }

    await db.update(documents).set({
      status_message: 'Chunking document...',
      progress_pct: 70
    }).where(eq(documents.id, docId));

    // Chunking
    const rawChunks = chunkText(fullText);
    const chunkRecords = rawChunks.map(c => ({
      doc_id: docId,
      idx: c.idx,
      text: c.text,
      start_offset: c.start_offset,
      end_offset: c.end_offset,
      tsv: c.text.toLowerCase(), // simplified; Phase 4 will use to_tsvector
    }));

    for (let i = 0; i < chunkRecords.length; i += 50) {
      await db.insert(chunksTable).values(chunkRecords.slice(i, i + 50));
    }

    await db.update(documents).set({
      status: 'ready',
      status_message: `Ready — ${pageCount} page${pageCount !== 1 ? 's' : ''}, ${detectedSections.length} sections, ${rawChunks.length} chunks`,
      progress_pct: 100,
      page_count: pageCount
    }).where(eq(documents.id, docId));

  } catch (error) {
    console.error(`Pipeline error for doc ${docId}:`, error);
    await db.update(documents).set({
      status: 'failed',
      error_code: 'UNKNOWN_ERROR',
      status_message: error instanceof Error ? error.message : 'Unknown error occurred'
    }).where(eq(documents.id, docId));
  }
}

