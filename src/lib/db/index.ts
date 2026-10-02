import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/legal_contract_analyser';

// Use a small pool (max 5 connections) to stay within Supabase session-mode limits
const isTransactionPooler = connectionString.includes(':6543');

const globalForPostgres = globalThis as unknown as {
  postgresClient: postgres.Sql<{}>;
};

export const client = globalForPostgres.postgresClient ?? postgres(connectionString, {
  prepare: isTransactionPooler ? false : true,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 30,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPostgres.postgresClient = client;
}

export const db = drizzle(client, { schema });
