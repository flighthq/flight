import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') {
  throw new Error('Usage: tsx scripts/prepareCapacitor.ts <android|ios>');
}

const toolRoot = resolve(import.meta.dirname, '..');
if (!existsSync(resolve(toolRoot, platform))) runCapacitor(['add', platform]);
runCapacitor(['sync', platform]);

function runCapacitor(arguments_: string[]): void {
  const result = spawnSync('npx', ['cap', ...arguments_], {
    cwd: toolRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
