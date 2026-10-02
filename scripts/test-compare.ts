import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'http://localhost:3000';

async function upload(filePath: string, fileName: string) {
  const file = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([file]), fileName);
  const res = await fetch(`${BASE}/api/documents/upload`, { method: 'POST', body: form });
  return res.json();
}

async function waitReady(docId: number, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(`${BASE}/api/documents/${docId}`);
    const data = await res.json();
    if (data.status === 'ready') return data;
    if (data.status === 'failed') throw new Error(`Document ${docId} failed: ${data.status_message}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for doc ${docId}`);
}

async function compare(docAId: number, docBId: number) {
  const res = await fetch(`${BASE}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docAId, docBId }),
  });
  return res.json();
}

async function pollCompare(id: number, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(`${BASE}/api/compare/${id}`);
    const data = await res.json();
    if (data.status === 'complete') return data;
    if (data.status === 'error') throw new Error(`Comparison failed: ${data.summary_json?.[0]}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timeout polling comparison ${id}`);
}

async function main() {
  console.log('Uploading contract-v1.docx...');
  const v1 = await upload('tests/fixtures/contract-v1.docx', 'contract-v1.docx');
  console.log('v1 docId:', v1.docId);

  console.log('Uploading contract-v2.docx...');
  const v2 = await upload('tests/fixtures/contract-v2.docx', 'contract-v2.docx');
  console.log('v2 docId:', v2.docId);

  console.log('Waiting for v1 to be ready...');
  await waitReady(v1.docId);
  console.log('v1 ready');

  console.log('Waiting for v2 to be ready...');
  await waitReady(v2.docId);
  console.log('v2 ready');

  console.log('Starting comparison...');
  const cmp = await compare(v1.docId, v2.docId);
  console.log('Comparison ID:', cmp.id);

  console.log('Polling for results...');
  const result = await pollCompare(cmp.id);

  console.log('\n=== COMPARISON RESULTS ===\n');
  console.log('Summary:', result.summary_json);

  const changes = result.changes_json || [];
  console.log('\n=== DETECTED CHANGES ===\n');
  console.table(
    changes
      .filter((c: any) => c.type !== 'unchanged')
      .map((c: any) => ({
        type: c.type,
        significance: c.significance,
        category: c.category,
        numericCallout: c.numeric?.map((n: any) => `${n.old} -> ${n.new}`).join(', ') || 'none',
        summary: c.summary,
      }))
  );

  // Check planted changes
  console.log('\n=== PLANTED CHANGE VERIFICATION ===\n');
  const liability = changes.find((c: any) =>
    c.numeric?.some((n: any) => n.old?.includes('100,000') && n.new?.includes('1,000,000'))
  );
  const payment = changes.find((c: any) =>
    c.numeric?.some((n: any) => n.old?.includes('30') && n.new?.includes('60') && n.kind === 'duration')
  );
  const reworded = changes.find((c: any) =>
    c.type === 'modified' && c.significance === 'cosmetic' && c.oldText?.includes('promptly') && c.newText?.includes('without delay')
  );
  const added = changes.find((c: any) => c.type === 'added' && c.newText?.includes('mediation'));
  const removed = changes.find((c: any) => c.type === 'removed' && c.oldText?.includes('affiliates'));

  const checks = [
    { name: 'Liability cap AED 100,000 -> 1,000,000', pass: liability && (liability.significance === 'critical' || liability.significance === 'high') && liability.numeric?.length > 0 },
    { name: 'Payment term 30 -> 60 days', pass: payment && (payment.significance === 'high' || payment.significance === 'medium') && payment.numeric?.length > 0 },
    { name: 'Reworded-only clause is cosmetic', pass: reworded && reworded.significance === 'cosmetic' },
    { name: 'Added clause type is added', pass: added && added.type === 'added' },
    { name: 'Removed clause type is removed', pass: removed && removed.type === 'removed' },
  ];

  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'}: ${check.name}`);
  }

  // Check if liability cap mentioned first in summary
  const summary = result.summary_json || [];
  const firstMentionsLiability = summary[0]?.includes('100,000') && summary[0]?.includes('1,000,000');
  console.log(`\nSummary mentions liability cap first: ${firstMentionsLiability ? 'YES' : 'NO'}`);
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});