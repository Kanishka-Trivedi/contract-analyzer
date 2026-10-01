const { detectSections } = require('./src/lib/document-processing/pipeline');

const contract = `
1. Definitions
In this Agreement the following terms have the following meanings.

1.1 Confidential Information means all information disclosed by one party to another.

2. Term
The term of this Agreement shall be 12 months from the Effective Date.
`;

const sections = detectSections(contract);
console.log(JSON.stringify(sections.map(s => ({ number: s.number, title: s.title })), null, 2));
