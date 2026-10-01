import { db } from '../src/lib/db';
import { documents, pages } from '../src/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { normalizeWithMap } from '../src/lib/verification/normalize';

async function backfill() {
  console.log('Fetching documents without norm_text...');
  const docsToUpdate = await db.select().from(documents).where(isNull(documents.norm_text));
  
  if (docsToUpdate.length === 0) {
    console.log('No documents need backfilling.');
    process.exit(0);
  }

  for (const doc of docsToUpdate) {
    console.log(`Processing document ID: ${doc.id}`);
    const docPages = await db.select().from(pages).where(eq(pages.doc_id, doc.id)).orderBy(pages.page_no);
    
    let fullText = '';
    for (const p of docPages) {
      fullText += p.text;
    }

    if (fullText) {
      const { norm, map } = normalizeWithMap(fullText);
      await db.update(documents).set({
        full_text: fullText,
        norm_text: norm,
        norm_map: map
      }).where(eq(documents.id, doc.id));
      console.log(`  Updated document ID: ${doc.id}`);
    } else {
      console.log(`  Skipped document ID: ${doc.id} (no text)`);
    }
  }

  console.log('Backfill complete.');
  process.exit(0);
}

backfill().catch(err => {
  console.error('Error during backfill:', err);
  process.exit(1);
});
