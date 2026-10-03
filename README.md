# Legal Contract Analyser

A document analysis application built with Next.js 14, TypeScript, and Drizzle ORM.

## Getting Started

First, ensure your environment variables are configured in `.env.local` based on `.env.example`.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scripts and fixtures
- `scripts/backfill-norm.ts`: recomputes normalised text for existing documents
- `scripts/db-setup.ts`: sets up database extensions (`npm run db:setup`)
- `scripts/make-compare-fixtures.ts`: generates test fixtures for document comparison (`npm run fixtures:compare`)
- `scripts/make-fixtures.ts`: generates general test fixtures (`npm run fixtures`)
- `scripts/test-compare.ts`: tests the comparison logic locally
- `tests/fixtures/`: contains document files (.pdf, .docx) used for testing
