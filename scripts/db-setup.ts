const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;
    console.log("pg_trgm extension created/exists.");
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
