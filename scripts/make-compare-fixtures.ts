import { Document, Packer, Paragraph, TextRun } from 'docx';
import fs from 'node:fs/promises';

async function write(path: string, lines: string[]) {
  const doc = new Document({ sections: [{ children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })) }] });
  await fs.writeFile(path, await Packer.toBuffer(doc));
}

await write('tests/fixtures/contract-v1.docx', ['1. LIABILITY. The liability cap is AED 100,000.', '2. PAYMENT. Payment is due within 30 days.', '3. REWORDING. The parties must give notice promptly.', '4. REMOVED. This clause applies to affiliates.']);
await write('tests/fixtures/contract-v2.docx', ['1. LIABILITY. The liability cap is AED 1,000,000.', '2. PAYMENT. Payment is due within 60 days.', '3. REWORDING. The parties shall provide notice without delay.', '5. ADDED. The parties agree to mediation.']);