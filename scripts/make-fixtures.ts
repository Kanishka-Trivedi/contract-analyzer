import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const fixturesDir = path.join(__dirname, '..', 'tests', 'fixtures');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

async function makeTextPDF() {
  return new Promise<void>((resolve) => {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(path.join(fixturesDir, 'sample-contract.pdf')));
    doc.fontSize(20).text('Employment Contract', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('1. Term. The term of employment shall be for 12 months.');
    doc.moveDown();
    doc.text('2. Termination. Either party may terminate with 30 days notice.');
    doc.end();
    doc.on('end', resolve);
  });
}

async function makeDocx() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: "Software License Agreement", bold: true, size: 28 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun("1. License Grant. The Licensor grants a non-exclusive license."),
          ],
        }),
      ],
    }],
  });
  
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(fixturesDir, 'sample-contract.docx'), buffer);
}

async function makeScannedPDF() {
  return new Promise<void>((resolve) => {
    // Generate a PDF with NO text, just a rectangle acting as an "image"
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(path.join(fixturesDir, 'scanned-contract.pdf')));
    doc.rect(50, 50, 400, 600).fill('gray');
    doc.end();
    doc.on('end', resolve);
  });
}

async function make150PagePDF() {
  return new Promise<void>((resolve) => {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(path.join(fixturesDir, 'long-contract.pdf')));
    
    for (let i = 1; i <= 150; i++) {
      if (i > 1) doc.addPage();
      doc.text(`Page ${i}`);
      doc.moveDown();
      if (i === 140) {
        doc.text('14. Force Majeure. Neither party shall be liable for any failure or delay in performance under this Agreement (other than for delay in the payment of money due and payable hereunder) to the extent said failures or delays are proximately caused by causes beyond that party\'s reasonable control.');
      } else {
        doc.text(`Filler content for section ${i}... The quick brown fox jumps over the lazy dog.`);
      }
    }
    
    doc.end();
    doc.on('end', resolve);
  });
}

async function generateAll() {
  console.log('Generating fixtures...');
  await makeTextPDF();
  await makeDocx();
  await makeScannedPDF();
  await make150PagePDF();
  console.log('Fixtures generated successfully.');
}

generateAll().catch(console.error);
