/**
 * Integration test script for the upload pipeline.
 * Run: npx tsx scripts/test-uploads.ts
 */
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const FIXTURES = path.join(__dirname, '..', 'tests', 'fixtures');

async function uploadFile(filename: string): Promise<{ status: number; body: any }> {
  const filePath = path.join(FIXTURES, filename);
  const fileBytes = fs.readFileSync(filePath);
  const blob = new Blob([fileBytes]);
  const form = new FormData();
  form.append('file', blob, filename);

  const res = await fetch(`${BASE}/api/documents/upload`, {
    method: 'POST',
    body: form,
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function waitForReady(docId: number, timeoutMs = 60_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/api/documents/${docId}`);
    const doc = await res.json();
    if (doc.status === 'ready' || doc.status === 'failed') {
      return doc.status;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return 'timeout';
}

async function runTests() {
  console.log('=== UPLOAD INTEGRATION TESTS ===\n');

  // 1. PDF upload
  console.log('TEST 1: Upload sample-contract.pdf (should succeed)');
  const pdfResult = await uploadFile('sample-contract.pdf');
  console.log(`  HTTP ${pdfResult.status} → ${JSON.stringify(pdfResult.body)}`);
  if (pdfResult.status !== 200 || !pdfResult.body.docId) {
    console.error('  FAIL: Expected 200 with docId');
  } else {
    const finalStatus = await waitForReady(pdfResult.body.docId);
    console.log(`  Final status: ${finalStatus}`);
    if (finalStatus === 'ready') console.log('  PASS ✓');
    else console.log('  FAIL: Did not reach ready');
  }

  // 2. DOCX upload
  console.log('\nTEST 2: Upload sample-contract.docx (should succeed)');
  const docxResult = await uploadFile('sample-contract.docx');
  console.log(`  HTTP ${docxResult.status} → ${JSON.stringify(docxResult.body)}`);
  if (docxResult.status !== 200 || !docxResult.body.docId) {
    console.error('  FAIL: Expected 200 with docId');
  } else {
    const finalStatus = await waitForReady(docxResult.body.docId);
    console.log(`  Final status: ${finalStatus}`);
    if (finalStatus === 'ready') console.log('  PASS ✓');
    else console.log('  FAIL: Did not reach ready');
  }

  // 3. Scanned PDF (should fail with NO_TEXT)
  console.log('\nTEST 3: Upload scanned-contract.pdf (should fail NO_TEXT)');
  const scannedResult = await uploadFile('scanned-contract.pdf');
  console.log(`  HTTP ${scannedResult.status} → ${JSON.stringify(scannedResult.body)}`);
  if (scannedResult.status !== 200 || !scannedResult.body.docId) {
    console.error('  FAIL: Expected 200 with docId (fails in pipeline, not at upload)');
  } else {
    const finalStatus = await waitForReady(scannedResult.body.docId);
    console.log(`  Final status: ${finalStatus}`);
    if (finalStatus === 'failed') console.log('  PASS ✓ (correctly failed)');
    else console.log('  FAIL: Expected failed status');
  }

  // 4. TXT file (should be rejected at upload)
  console.log('\nTEST 4: Upload a .txt file (should be rejected 400)');
  const txtBytes = Buffer.from('This is a plain text file, not a contract.');
  const txtBlob = new Blob([txtBytes], { type: 'text/plain' });
  const txtForm = new FormData();
  txtForm.append('file', txtBlob, 'dummy.txt');
  const txtRes = await fetch(`${BASE}/api/documents/upload`, { method: 'POST', body: txtForm });
  const txtBody = await txtRes.json();
  console.log(`  HTTP ${txtRes.status} → ${JSON.stringify(txtBody)}`);
  if (txtRes.status === 400 && txtBody.error && txtBody.error.includes('supported')) {
    console.log('  PASS ✓');
  } else {
    console.log('  FAIL: Expected 400 with clear error message');
  }

  // 5. 150-page PDF
  console.log('\nTEST 5: Upload long-contract.pdf (150 pages, should reach ready)');
  const longResult = await uploadFile('long-contract.pdf');
  console.log(`  HTTP ${longResult.status} → ${JSON.stringify(longResult.body)}`);
  if (longResult.status !== 200 || !longResult.body.docId) {
    console.error('  FAIL: Expected 200 with docId');
  } else {
    console.log('  Waiting for processing (may take up to 60s)...');
    const finalStatus = await waitForReady(longResult.body.docId, 90_000);
    // Check page_count
    const docRes = await fetch(`${BASE}/api/documents/${longResult.body.docId}`);
    const doc = await docRes.json();
    console.log(`  Final status: ${finalStatus}, page_count: ${doc.page_count}`);
    if (finalStatus === 'ready' && doc.page_count === 150) console.log('  PASS ✓ (150 pages)');
    else if (finalStatus === 'ready') console.log(`  PARTIAL: reached ready but page_count=${doc.page_count} (expected 150)`);
    else console.log('  FAIL');
  }

  console.log('\n=== TESTS COMPLETE ===');
}

runTests().catch(console.error);
