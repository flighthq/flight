import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveVitestArguments(arguments_: readonly string[]): string[] {
  if (arguments_[0] === 'conformance') return ['--project', 'conformance', ...arguments_.slice(1)];
  if (arguments_.includes('--all')) return arguments_.filter((a) => a !== '--all');
  if (arguments_.some((a) => a === '--project' || a.startsWith('--project='))) return [...arguments_];
  return ['--project', 'shared', ...arguments_];
}

function main(): void {
  const vitestPath = resolve(import.meta.dirname, '../node_modules/vitest/vitest.mjs');
  const result = spawnSync(process.execPath, [vitestPath, 'run', ...resolveVitestArguments(process.argv.slice(2))], {
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  process.exit(result.status ?? 1);
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
