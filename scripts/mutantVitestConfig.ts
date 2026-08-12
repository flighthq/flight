import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfigFromFile } from 'vite';
import type { Plugin } from 'vitest/config';
import { defineConfig, mergeConfig } from 'vitest/config';

import { applyMutantText, APPLIED_MARKER, MUTANT_ENVIRONMENT } from './unchecked-core.js';

// The vitest config `npm run unchecked` runs every mutant under. One process per mutant, and the mutated
// source NEVER reaches the disk: a pre-enforced `load` hook serves the spliced text in place of the file's
// real contents, so an interrupted run — even `kill -9` — cannot leave a corrupted source file behind in a
// tree an agent is about to commit. That safety is the whole reason this file exists rather than a
// write-test-restore loop, which is both simpler and unrecoverable at exactly the wrong moment.
//
// It layers over the target package's OWN vitest config so a mutant runs under the same environment
// (`node` vs `jsdom`), setup files, and includes as `npm run test --workspace=packages/<name>`. Running a
// mutant under a different config than the suite it is measuring would make every verdict about the
// harness rather than the tests.
export default defineConfig(async () => {
  const environment = readMutantEnvironment();
  const packageConfigPath = resolve(repoRoot, 'packages', environment.packageName, 'vitest.config.ts');
  // Vite's own config loader rather than a dynamic `import()`: this file is bundled before it runs, so a
  // runtime import of a sibling `.ts` config escapes that bundling and reaches node with an extension it
  // cannot load. `loadConfigFromFile` bundles the target the same way, which also keeps the package's real
  // plugin instances rather than a JSON-flattened copy of its settings.
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, packageConfigPath, repoRoot);
  if (loaded === null) throw new Error(`Could not load ${packageConfigPath}.`);

  return mergeConfig(loaded.config, defineConfig({ plugins: [mutantPlugin(environment)] }));
});

interface MutantEnvironment {
  end: number;
  filePath: string;
  packageName: string;
  replacement: string;
  start: number;
}

const repoRoot = resolve(import.meta.dirname, '..');

// Serves the mutated text for exactly one file id, before any other plugin sees it. `enforce: 'pre'` puts
// this ahead of vite's own TypeScript handling, so the splice applies to the source text the offsets were
// computed against rather than to already-lowered output.
//
// The marker on stderr is the instrument check, not logging. A `load` hook that never fires — a resolution
// mismatch, a test file that never imports the subject — leaves the tests passing against UNMUTATED source,
// which is indistinguishable from a killed mutant by exit code alone. The runner refuses to record any
// verdict for a run that did not print this line, so a broken harness reports as broken instead of
// reporting a clean bill of health for tests that were never challenged.
function mutantPlugin(environment: MutantEnvironment): Plugin {
  return {
    enforce: 'pre',
    load(id: string) {
      if (resolve(stripQuery(id)) !== environment.filePath) return null;
      // The same splice the planner validated against, not a second copy of it. `planMutants` guarantees
      // every mutant it emits re-parses, and that guarantee only transfers if the text served here is the
      // text that was checked.
      const mutated = applyMutantText(readFileSync(environment.filePath, 'utf8'), environment);
      process.stderr.write(`${APPLIED_MARKER}\n`);
      return mutated;
    },
    name: 'flight-unchecked-mutant',
  };
}

function readMutantEnvironment(): MutantEnvironment {
  const raw = process.env[MUTANT_ENVIRONMENT];
  if (raw === undefined) {
    throw new Error(`${MUTANT_ENVIRONMENT} is unset — this config is only usable through \`npm run unchecked\`.`);
  }
  return JSON.parse(raw) as MutantEnvironment;
}

function stripQuery(id: string): string {
  const marker = id.indexOf('?');
  return marker < 0 ? id : id.slice(0, marker);
}
