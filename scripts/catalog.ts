// The canonical built-in registry ownership inventory, DERIVED from the shipped handler families
// rather than transcribed — see scripts/catalog-rows.ts for why only the parser backend is populated.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RequirementCatalogEntry } from '@flighthq/types/contract';

import { formatBuiltInRequirementCatalogSource, verifyRequirementCatalogEntries } from './catalog-core';
import { buildRenderCatalogRows, buildRequirementTranslations } from './catalog-render-rows';
import { buildRequirementCatalogRows } from './catalog-rows';

const ENTRIES: readonly RequirementCatalogEntry[] = [...buildRequirementCatalogRows(), ...buildRenderCatalogRows()];
const TRANSLATIONS = buildRequirementTranslations();
const REPO_ROOT = join(import.meta.dirname, '..');
const OUTPUT_PATH = join(REPO_ROOT, 'packages', 'requirement-catalog', 'src', 'builtInRequirementCatalogEntries.ts');

const problems = verifyRequirementCatalogEntries(ENTRIES);
if (problems.length > 0) {
  console.error(`✗ registry catalog is malformed:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  const source = formatBuiltInRequirementCatalogSource(ENTRIES, TRANSLATIONS);
  if (process.argv.includes('--check')) {
    if (readIfPresent(OUTPUT_PATH) !== source) {
      console.error(
        '✗ stale, run `npm run catalog`:\n  packages/requirement-catalog/src/builtInRequirementCatalogEntries.ts',
      );
      process.exitCode = 1;
    } else {
      console.log(
        `OK ${ENTRIES.length} built-in registry catalog entries and ${TRANSLATIONS.length} translations, generated source current`,
      );
    }
  } else {
    writeFileSync(OUTPUT_PATH, source);
    console.log(`✓ wrote ${ENTRIES.length} built-in registry catalog entries and ${TRANSLATIONS.length} translations`);
  }
}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}
