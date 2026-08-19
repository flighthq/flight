import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSwfImportConformanceWorkerPool } from './swf-import-conformance-worker-pool';

describe('runSwfImportConformanceWorkerPool', () => {
  it(
    'imports every fixture without fail-fast and returns results in input order',
    async () => {
      const { results } = await runPoolWithSyntheticFixtures();
      expect(results.map((result) => result.reference)).toEqual(['invalid.swf', 'minimal.swf']);
      expect(results[0]).toMatchObject({ imported: false, threw: false });
      expect(results[1]).toMatchObject({ imported: true, threw: false });
    },
    POOL_SEMANTICS_TIMEOUT_MS,
  );

  it(
    'reports worker startup and module-graph load time',
    async () => {
      const { elapsedMs } = await runPoolWithSyntheticFixtures();
      console.log(
        `[worker-pool load budget] ${elapsedMs.toFixed(0)} ms to start 2 workers and load the SWF importer module graph`,
      );
      expect(elapsedMs).toBeLessThan(LOAD_BUDGET_HARD_CEILING_MS);
    },
    POOL_SEMANTICS_TIMEOUT_MS,
  );
});

async function runPoolWithSyntheticFixtures(): Promise<{
  results: Awaited<ReturnType<typeof runSwfImportConformanceWorkerPool>>;
  elapsedMs: number;
}> {
  const directory = mkdtempSync(join(tmpdir(), 'flight-swf-workers-'));
  const invalid = join(directory, 'invalid.swf');
  const minimal = join(directory, 'minimal.swf');
  writeFileSync(invalid, new Uint8Array([1, 2, 3]));
  writeFileSync(minimal, createMinimalSwf());

  const start = performance.now();
  const results = await runSwfImportConformanceWorkerPool([
    { path: invalid, reference: 'invalid.swf', sourceHash: 'a'.repeat(64) },
    { path: minimal, reference: 'minimal.swf', sourceHash: 'b'.repeat(64) },
  ]);
  const elapsedMs = performance.now() - start;
  return { results, elapsedMs };
}

function createMinimalSwf(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x46, 0x57, 0x53, 9, 16, 0, 0, 0, 0x08, 0, 0, 24, 1, 0, 0, 0]);
  return bytes;
}

// Pool semantics should never fail for being slow — generous timeout.
const POOL_SEMANTICS_TIMEOUT_MS = 60_000;

// The load budget is an explicit measurement, not a timeout. The hard ceiling catches catastrophic
// regressions (stuck workers, missing modules); the console.log reports the actual number so CI logs
// surface drift from the observed 6-11s range before a ceiling is ever hit.
const LOAD_BUDGET_HARD_CEILING_MS = 30_000;
