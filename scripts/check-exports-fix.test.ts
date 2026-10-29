import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_EXPORTS = resolve(ROOT, 'scripts/check-exports.ts');
const TSX = resolve(ROOT, 'node_modules/tsx/dist/cli.mjs');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

it('repairs a split contract barrel and remains clean on the next check and fix', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'flight-check-exports-'));
  temporaryDirectories.push(fixtureRoot);
  const fixturePackage = join(fixtureRoot, 'packages', 'app');
  mkdirSync(fixturePackage, { recursive: true });
  cpSync(resolve(ROOT, 'packages/app/src'), join(fixturePackage, 'src'), { recursive: true });
  cpSync(resolve(ROOT, 'packages/app/exports.yml'), join(fixturePackage, 'exports.yml'));
  cpSync(resolve(ROOT, 'packages/app/tsconfig.runtime.json'), join(fixturePackage, 'tsconfig.runtime.json'));

  const contractPath = join(fixturePackage, 'src', 'contract.ts');
  writeFileSync(contractPath, "export * from './contract.app-types.ts';\n");

  const firstFix = runCheck(fixtureRoot, '--fix');
  expect(firstFix.output).toContain('fixed: regenerated contract.ts + runtime.ts + index.ts');

  const repairedContract = "export * from './contract.app-types.ts';\n" + "export * from './runtime.ts';\n";
  expect(readFileSync(contractPath, 'utf8')).toBe(repairedContract);

  const check = runCheck(fixtureRoot);
  expect(check.status, check.output).toBe(0);
  expect(check.output).toContain('app: both files match');

  const secondFix = runCheck(fixtureRoot, '--fix');
  expect(secondFix.status, secondFix.output).toBe(0);
  expect(readFileSync(contractPath, 'utf8')).toBe(repairedContract);

  const secondCheck = runCheck(fixtureRoot);
  expect(secondCheck.status, secondCheck.output).toBe(0);
});

it('accepts dependency-owned values derived into generated Rust lanes', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'flight-check-exports-generated-'));
  temporaryDirectories.push(fixtureRoot);
  const fixtureSource = join(fixtureRoot, 'packages', 'textlayout', 'src');
  mkdirSync(fixtureSource, { recursive: true });

  writeFileSync(join(fixtureSource, 'local.ts'), 'export function localValue() {}\n');
  writeFileSync(
    join(fixtureSource, 'contract.ts'),
    '// Generated from crates/flight-textlayout/src/lib.rs by flight-compiler.\n' +
      "export { localValue } from './local.ts';\n" +
      "export { dependencyProtected, dependencyPublic } from '@flighthq/dependency/contract';\n",
  );
  writeFileSync(
    join(fixtureSource, 'index.ts'),
    '// Generated from crates/flight-textlayout/src/lib.rs by flight-compiler.\n' +
      "export { localValue } from './local.ts';\n" +
      "export { dependencyPublic } from '@flighthq/dependency/contract';\n",
  );

  const check = runCheck(fixtureRoot);
  expect(check.status, check.output).toBe(0);
  expect(check.output).toContain('textlayout: both files match');
});

function runCheck(root: string, ...args: string[]): { output: string; status: number | null } {
  const result = spawnSync(process.execPath, [TSX, CHECK_EXPORTS, '--root', root, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}
