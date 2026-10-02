import fs from 'node:fs';

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

async function runComparison(v1Path: string, v2Path: string, name: string) {
  console.log(`\n========== ${name} ==========\n`);
  
  console.log(`Uploading ${v1Path}...`);
  const v1 = await upload(v1Path, v1Path.split('/').pop()!);
  console.log('v1 docId:', v1.docId);

  console.log(`Uploading ${v2Path}...`);
  const v2 = await upload(v2Path, v2Path.split('/').pop()!);
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

  return { changes, summary: result.summary_json };
}

async function main() {
  // Test 1: Original 4-clause pair
  const { changes: changes1, summary: summary1 } = await runComparison(
    'tests/fixtures/contract-v1.docx',
    'tests/fixtures/contract-v2.docx',
    'ORIGINAL 4-CLAUSE PAIR'
  );

  console.log('\n=== PLANTED CHANGE VERIFICATION (4-clause) ===\n');
  const liability1 = changes1.find((c: any) =>
    c.numeric?.some((n: any) => n.old?.includes('100,000') && n.new?.includes('1,000,000'))
  );
  const payment1 = changes1.find((c: any) =>
    c.numeric?.some((n: any) => n.old?.includes('30') && n.new?.includes('60') && n.kind === 'duration')
  );
  const reworded1 = changes1.find((c: any) =>
    c.type === 'modified' && c.significance === 'cosmetic' && c.oldText?.includes('promptly') && c.newText?.includes('without delay')
  );
  const added1 = changes1.find((c: any) => c.type === 'added' && c.newText?.includes('mediation'));
  const removed1 = changes1.find((c: any) => c.type === 'removed' && c.oldText?.includes('affiliates'));

  const checks1 = [
    { name: 'Liability cap AED 100,000 -> 1,000,000', pass: liability1 && (liability1.significance === 'critical' || liability1.significance === 'high') && liability1.numeric?.length > 0 },
    { name: 'Payment term 30 -> 60 days', pass: payment1 && (payment1.significance === 'high' || payment1.significance === 'medium') && payment1.numeric?.length > 0 },
    { name: 'Reworded-only clause is cosmetic', pass: reworded1 && reworded1.significance === 'cosmetic' },
    { name: 'Added clause type is added', pass: added1 && added1.type === 'added' },
    { name: 'Removed clause type is removed', pass: removed1 && removed1.type === 'removed' },
  ];

  for (const check of checks1) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'}: ${check.name}`);
  }

  const firstMentionsLiability1 = summary1[0]?.includes('100,000') && summary1[0]?.includes('1,000,000');
  console.log(`\nSummary mentions liability cap first: ${firstMentionsLiability1 ? 'YES' : 'NO'}`);

  // Test 2: New 15-clause pair
  const { changes: changes2, summary: summary2 } = await runComparison(
    'tests/fixtures/contract-long-v1.docx',
    'tests/fixtures/contract-long-v2.docx',
    'NEW 15-CLAUSE PAIR'
  );

  console.log('\n=== PLANTED CHANGE VERIFICATION (15-clause) ===\n');
  const liability2 = changes2.find((c: any) =>
    c.numeric?.some((n: any) => n.old?.includes('100,000') && n.new?.includes('1,000,000'))
  );
  const payment2 = changes2.find((c: any) =>
    c.numeric?.some((n: any) => n.old?.includes('30') && n.new?.includes('60') && n.kind === 'duration')
  );
  const termination2 = changes2.find((c: any) =>
    c.numeric?.some((n: any) => n.old?.includes('30') && n.new?.includes('90') && n.kind === 'duration')
  );
  const governingLaw2 = changes2.find((c: any) =>
    c.oldText?.includes('UAE') && c.newText?.includes('England')
  );
  const notices2 = changes2.find((c: any) =>
    c.type === 'modified' && c.significance === 'cosmetic' && c.oldText?.includes('delivered by email') && c.newText?.includes('sent via email')
  );
  const dataProtection2 = changes2.find((c: any) =>
    c.type === 'added' && c.newText?.includes('DATA PROTECTION')
  );
  const insurance2 = changes2.find((c: any) =>
    c.type === 'removed' && c.oldText?.includes('INSURANCE')
  );
  const insuranceMoved2 = changes2.find((c: any) =>
    c.type === 'moved' && c.oldText?.includes('INSURANCE')
  );
  const governingLawMoved2 = changes2.find((c: any) =>
    c.type === 'moved' && c.oldText?.includes('GOVERNING LAW')
  );

  // Check for false positives: only expected clauses should appear as non-unchanged
  const expectedNonUnchangedTypes = new Set(['modified', 'added', 'removed']);
  const unexpectedModified = changes2.filter((c: any) => 
    c.type === 'modified' && 
    !c.numeric?.length && // no numeric changes
    !c.oldText?.includes('UAE') && // not governing law
    !c.oldText?.includes('delivered by email') && // not notices
    !c.oldText?.includes('30 days') && // not payment/termination
    !c.oldText?.includes('100,000') // not liability
  );
  const noFalsePositives = unexpectedModified.length === 0;

  const checks2 = [
    { name: 'Liability cap AED 100,000 -> 1,000,000', pass: liability2 && (liability2.significance === 'critical' || liability2.significance === 'high') && liability2.numeric?.length > 0 },
    { name: 'Payment 30 -> 60 days', pass: payment2 && (payment2.significance === 'high' || payment2.significance === 'medium') && payment2.numeric?.length > 0 },
    { name: 'Termination notice 30 -> 90 days', pass: termination2 && (termination2.significance === 'high' || termination2.significance === 'medium') && termination2.numeric?.length > 0 },
    { name: 'Governing Law change (UAE -> England)', pass: governingLaw2 && (governingLaw2.significance === 'high' || governingLaw2.significance === 'critical') },
    { name: 'Notices rewording -> cosmetic', pass: notices2 && notices2.significance === 'cosmetic' },
    { name: 'Data Protection -> added', pass: dataProtection2 && dataProtection2.type === 'added' },
    { name: 'Insurance -> removed (not moved/modified)', pass: insurance2 && insurance2.type === 'removed' && !insuranceMoved2 },
    { name: 'Governing Law -> modified (not moved)', pass: governingLaw2 && governingLaw2.type === 'modified' && !governingLawMoved2 },
    { name: 'No false positives on untouched clauses', pass: noFalsePositives },
  ];

  for (const check of checks2) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'}: ${check.name}`);
  }

  const firstMentionsLiability2 = summary2[0]?.includes('100,000') && summary2[0]?.includes('1,000,000');
  console.log(`\nSummary mentions liability cap first: ${firstMentionsLiability2 ? 'YES' : 'NO'}`);

  // Overall result
  const allPass = [...checks1, ...checks2].every(c => c.pass) && firstMentionsLiability1 && firstMentionsLiability2;
  console.log(`\n=== OVERALL: ${allPass ? 'ALL TESTS PASS' : 'SOME TESTS FAILED'} ===`);
  
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});