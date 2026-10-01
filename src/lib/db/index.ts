import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/legal_contract_analyser';

// Use a small pool (max 5 connections) to stay within Supabase session-mode limits
export const client = postgres(connectionString, {
  prepare: false,       // required for Supabase/PgBouncer transaction mode
  max: 5,               // pool size
  idle_timeout: 20,     // close idle connections after 20s
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });
