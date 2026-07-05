const [name = 'test', ...detailParts] = process.argv.slice(2);
const detail = detailParts.join(' ') || 'This test variant is not available.';

console.error(`[${name}] ${detail}`);
process.exit(1);
