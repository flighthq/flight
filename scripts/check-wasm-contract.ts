// Drift guard for the committed wasm type contracts. Run AFTER `build:wasm`
// (which regenerates `src/wasm/surface_wasm.d.ts` from the Rust binding): if the
// freshly generated contract differs from what is committed, the Rust binding's
// signatures changed but the committed `.d.ts` header was not re-committed.
// `ci` runs `build:wasm` then this, so CI always type-checks against a contract
// that matches the actual glue.
//
// `git diff --exit-code` returns 0 = no change, 1 = changes, other = git error
// (e.g. not a repo). Only 1 is real drift; treat git errors as "skip" so the
// guard never blocks where git is unavailable.

import { spawnSync } from 'node:child_process';

const contractPathspec = 'packages/*/src/wasm/*.d.ts';
const diff = spawnSync('git', ['diff', '--stat', '--exit-code', '--', contractPathspec], {
  encoding: 'utf8',
});

if (diff.error || (diff.status !== 0 && diff.status !== 1)) {
  console.warn('[check:wasm] git unavailable — skipping wasm contract drift check.');
  process.exit(0);
}

if (diff.status === 1) {
  process.stdout.write(diff.stdout ?? '');
  console.error(
    '\n[check:wasm] committed wasm type contract is stale: `build:wasm` regenerated a\n' +
      `  different ${contractPathspec} than is committed. The Rust binding's signatures\n` +
      '  changed — re-run `npm run build:wasm` and commit the updated `src/wasm/*.d.ts`.\n',
  );
  process.exit(1);
}

console.log('[check:wasm] wasm type contracts are up to date.');
