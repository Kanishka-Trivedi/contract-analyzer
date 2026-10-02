import { Document, Packer, Paragraph, TextRun } from 'docx';
import fs from 'node:fs/promises';

async function write(path: string, lines: string[]) {
  const doc = new Document({ sections: [{ children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })) }] });
  await fs.writeFile(path, await Packer.toBuffer(doc));
}

// Original 4-clause fixtures
const originalV1 = [
  '1. LIABILITY. The liability cap is AED 100,000.',
  '2. PAYMENT. Payment is due within 30 days.',
  '3. REWORDING. The parties must give notice promptly.',
  '4. REMOVED. This clause applies to affiliates.',
];

const originalV2 = [
  '1. LIABILITY. The liability cap is AED 1,000,000.',
  '2. PAYMENT. Payment is due within 60 days.',
  '3. REWORDING. The parties shall provide notice without delay.',
  '5. ADDED. The parties agree to mediation.',
];

// New 15-clause realistic service agreement fixtures
const longV1 = [
  '1. DEFINITIONS. "Services" means the professional services described in Schedule A. "Confidential Information" means all non-public information disclosed by either party.',
  '2. SERVICES. The Provider shall perform the Services in a professional and workmanlike manner, consistent with industry standards. The Provider shall comply with all applicable laws and regulations.',
  '3. FEES AND PAYMENT. The Client shall pay the Provider the fees set forth in Schedule B. Payment is due within 30 days of invoice date. Late payments accrue interest at 1.5% per month.',
  '4. TERM. This Agreement commences on the Effective Date and continues for a period of 12 months unless terminated earlier in accordance with this Agreement.',
  '5. TERMINATION. Either party may terminate this Agreement for material breach upon 30 days written notice if the breach is not cured within such period. Either party may terminate for convenience upon 60 days written notice.',
  '6. CONFIDENTIALITY. Each party shall protect the other\'s Confidential Information with the same degree of care it uses for its own confidential information, but no less than reasonable care. This obligation survives for 3 years after termination.',
  '7. INTELLECTUAL PROPERTY. All work product, deliverables, and inventions created by the Provider in connection with the Services shall be the exclusive property of the Client. The Provider assigns all rights, title, and interest to the Client.',
  '8. WARRANTIES. The Provider warrants that the Services will be performed in a professional manner. The Provider disclaims all other warranties, express or implied, including merchantability and fitness for a particular purpose.',
  '9. LIABILITY. The Provider\'s total liability under this Agreement shall not exceed AED 100,000. In no event shall either party be liable for indirect, consequential, or punitive damages.',
  '10. INDEMNITY. The Provider shall indemnify and hold harmless the Client from claims arising from the Provider\'s negligence or willful misconduct. The Client shall indemnify the Provider for claims arising from the Client\'s content.',
  '11. INSURANCE. The Provider shall maintain professional liability insurance with coverage of at least AED 500,000. The Provider shall provide certificates of insurance upon request.',
  '12. FORCE MAJEURE. Neither party shall be liable for delays caused by events beyond its reasonable control, including natural disasters, war, terrorism, or government actions.',
  '13. GOVERNING LAW. This Agreement shall be governed by the laws of the UAE. Any disputes shall be resolved in the courts of Dubai.',
  '14. NOTICES. All notices must be in writing and delivered by email or registered mail to the addresses set forth in the preamble. Notices are deemed received upon personal delivery or 3 business days after mailing.',
  '15. GENERAL. This Agreement constitutes the entire understanding between the parties. Amendments must be in writing and signed by both parties. Severability applies if any provision is unenforceable.',
];

const longV2 = [
  '1. DEFINITIONS. "Services" means the professional services described in Schedule A. "Confidential Information" means all non-public information disclosed by either party.',
  '2. SERVICES. The Provider shall perform the Services in a professional and workmanlike manner, consistent with industry standards. The Provider shall comply with all applicable laws and regulations.',
  '3. FEES AND PAYMENT. The Client shall pay the Provider the fees set forth in Schedule B. Payment is due within 60 days of invoice date. Late payments accrue interest at 1.5% per month.',
  '4. TERM. This Agreement commences on the Effective Date and continues for a period of 12 months unless terminated earlier in accordance with this Agreement.',
  '5. TERMINATION. Either party may terminate this Agreement for material breach upon 90 days written notice if the breach is not cured within such period. Either party may terminate for convenience upon 60 days written notice.',
  '6. CONFIDENTIALITY. Each party shall protect the other\'s Confidential Information with the same degree of care it uses for its own confidential information, but no less than reasonable care. This obligation survives for 3 years after termination.',
  '7. INTELLECTUAL PROPERTY. All work product, deliverables, and inventions created by the Provider in connection with the Services shall be the exclusive property of the Client. The Provider assigns all rights, title, and interest to the Client.',
  '8. WARRANTIES. The Provider warrants that the Services will be performed in a professional manner. The Provider disclaims all other warranties, express or implied, including merchantability and fitness for a particular purpose.',
  '9. LIABILITY. The Provider\'s total liability under this Agreement shall not exceed AED 1,000,000. In no event shall either party be liable for indirect, consequential, or punitive damages.',
  '10. INDEMNITY. The Provider shall indemnify and hold harmless the Client from claims arising from the Provider\'s negligence or willful misconduct. The Client shall indemnify the Provider for claims arising from the Client\'s content.',
  '11. DATA PROTECTION. The Provider shall comply with all applicable data protection laws. Personal data shall be processed only in accordance with the Client\'s instructions.',
  '12. FORCE MAJEURE. Neither party shall be liable for delays caused by events beyond its reasonable control, including natural disasters, war, terrorism, or government actions.',
  '13. GOVERNING LAW. This Agreement shall be governed by the laws of England and Wales. Any disputes shall be resolved in the courts of London.',
  '14. NOTICES. All notices shall be provided in writing and sent via email or certified post to the addresses in the preamble. Notices are considered received upon delivery or 3 business days post mailing.',
  '15. GENERAL. This Agreement constitutes the entire understanding between the parties. Amendments must be in writing and signed by both parties. Severability applies if any provision is unenforceable.',
];

async function main() {
  await write('tests/fixtures/contract-v1.docx', originalV1);
  await write('tests/fixtures/contract-v2.docx', originalV2);
  await write('tests/fixtures/contract-long-v1.docx', longV1);
  await write('tests/fixtures/contract-long-v2.docx', longV2);
  console.log('Generated: tests/fixtures/contract-v1.docx');
  console.log('Generated: tests/fixtures/contract-v2.docx');
  console.log('Generated: tests/fixtures/contract-long-v1.docx');
  console.log('Generated: tests/fixtures/contract-long-v2.docx');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});