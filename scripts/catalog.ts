// The canonical built-in registry ownership inventory. Stage 4 deliberately leaves this list empty:
// population belongs to the later migration thread, after the rendering-drift gate closes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RegistryCatalogEntry } from '@flighthq/types/contract';

import { formatBuiltInRegistryCatalogSource, verifyRegistryCatalogEntries } from './catalog-core';

const ENTRIES: readonly RegistryCatalogEntry[] = [];
const REPO_ROOT = join(import.meta.dirname, '..');
const OUTPUT_PATH = join(REPO_ROOT, 'packages', 'registry-catalog', 'src', 'builtInRegistryCatalogEntries.ts');

const problems = verifyRegistryCatalogEntries(ENTRIES);
if (problems.length > 0) {
  console.error(`✗ registry catalog is malformed:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  const source = formatBuiltInRegistryCatalogSource(ENTRIES);
  if (process.argv.includes('--check')) {
    if (readIfPresent(OUTPUT_PATH) !== source) {
      console.error(
        '✗ stale, run `npm run catalog`:\n  packages/registry-catalog/src/builtInRegistryCatalogEntries.ts',
      );
      process.exitCode = 1;
    } else {
      console.log(`OK ${ENTRIES.length} built-in registry catalog entries, generated source current`);
    }
  } else {
    writeFileSync(OUTPUT_PATH, source);
    console.log(`✓ wrote ${ENTRIES.length} built-in registry catalog entries`);
  }
}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}
