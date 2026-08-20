import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');

// ★ THE ROOT PROJECT LISTS REVIEW HELPERS ONE BY ONE, SO ADDING ONE IS A TWO-FILE CHANGE. Only the pure
// helpers are listed — the rest of tools/review is browser code whose DOM types this project does not
// carry — which means there is no `include` glob to pick a new file up. Import one from a scripts test
// without listing it and `tsc -p tsconfig.json` fails with TS6307, while `tsc -p tools/review/tsconfig.json`
// stays green: the narrower selector a helper's author naturally reaches for cannot see the breakage.
describe('review helpers imported by scripts tests', () => {
  it('are all listed in the root tsconfig include', () => {
    const tsconfig = readFileSync(join(repoRoot, 'tsconfig.json'), 'utf8');
    const imported = new Set<string>();
    for (const file of readdirSync(scriptsDir).filter((name) => name.endsWith('.test.ts'))) {
      const source = readFileSync(join(scriptsDir, file), 'utf8');
      for (const match of source.matchAll(/from '\.\.\/(tools\/review\/src\/[\w-]+)'/g)) {
        imported.add(`${match[1]!}.ts`);
      }
    }

    // Guard the guard: a regex that matched nothing would make this test pass by measuring an empty set.
    expect(imported.size).toBeGreaterThan(0);
    expect([...imported].sort().filter((path) => !tsconfig.includes(`"${path}"`))).toEqual([]);
  });
});
