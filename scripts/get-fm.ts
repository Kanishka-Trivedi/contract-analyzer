import { db } from '../src/lib/db';
import { documents } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

async function run() {
  const doc = await db.select().from(documents).where(eq(documents.id, 16));
  const text = doc[0]?.full_text ?? '';
  const idx = text.indexOf('Force Majeure');
  fs.writeFileSync('fm.txt', text.substring(Math.max(0, idx - 100), idx + 500));
  process.exit(0);
}
run();
