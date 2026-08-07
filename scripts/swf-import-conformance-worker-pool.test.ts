import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSwfImportConformanceWorkerPool } from './swf-import-conformance-worker-pool';

describe('runSwfImportConformanceWorkerPool', () => {
  it('imports every fixture without fail-fast and returns results in input order', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-swf-workers-'));
    const invalid = join(directory, 'invalid.swf');
    const minimal = join(directory, 'minimal.swf');
    writeFileSync(invalid, new Uint8Array([1, 2, 3]));
    writeFileSync(minimal, createMinimalSwf());

    const results = await runSwfImportConformanceWorkerPool([
      { path: invalid, reference: 'invalid.swf', sourceHash: 'a'.repeat(64) },
      { path: minimal, reference: 'minimal.swf', sourceHash: 'b'.repeat(64) },
    ]);
    expect(results.map((result) => result.reference)).toEqual(['invalid.swf', 'minimal.swf']);
    expect(results[0]).toMatchObject({ imported: false, threw: false });
    expect(results[1]).toMatchObject({ imported: true, threw: false });
  });
});

function createMinimalSwf(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x46, 0x57, 0x53, 9, 16, 0, 0, 0, 0x08, 0, 0, 24, 1, 0, 0, 0]);
  return bytes;
}
