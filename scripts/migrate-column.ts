import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS norm_map jsonb`);
    console.log('Added norm_map successfully');
  } catch(e) {
    console.error('FAILED TO ALTER TABLE', e);
  }
  process.exit(0);
}

run();
