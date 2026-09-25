import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// These are the package entries that have previously crossed an unbundled Node boundary: Vite config
// dependencies, CLI libraries, and the application-facing surfaces named in downstream import reports.
// The root build runs this only after tsc has emitted every package, so resolution cannot fall back to
// source aliases or a bundler. A failure here is a failure of the same dist graph npm publishes.
const NODE_IMPORT_SPECIFIERS = [
  '@flighthq/requirement-catalog',
  '@flighthq/scene3d-formats',
  '@flighthq/sdk',
  '@flighthq/swf',
  '@flighthq/tool-capture',
  '@flighthq/tool-manifest',
  '@flighthq/tool-pipeline',
  '@flighthq/tool-registry',
  '@flighthq/types/contract',
  '@flighthq/vite-plugin-manifest',
] as const;

const repositoryRoot = resolve(import.meta.dirname, '..');
const failures: string[] = [];
for (const specifier of NODE_IMPORT_SPECIFIERS) {
  // Launch a pristine Node process: this script itself runs through tsx, whose resolver could make a
  // broken emitted graph look healthy by applying TypeScript or bundler-style fallback semantics.
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(specifier)})`],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );
  if (result.status === 0) {
    process.stdout.write(`✓ ${specifier}\n`);
  } else {
    failures.push(`${specifier}: ${result.stderr.trim() || `Node exited ${result.status ?? 'without a status'}`}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `Node could not import ${failures.length} built package entr${failures.length === 1 ? 'y' : 'ies'}:\n`,
  );
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exit(1);
}
