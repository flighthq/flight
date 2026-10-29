import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getModulePublishedValueExports } from './export-lane-source.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'flight-textbidi-generation-'));
const crateRoot = join(fixtureRoot, 'crate');
const packageRoot = join(fixtureRoot, 'package');
const packageSourceRoot = join(packageRoot, 'src');
const generatorPath = join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

const PUBLIC_EXPORTS = [
  'compactBidiClassKernel',
  'disableTextBidiGuards',
  'enableTextBidiGuards',
  'explainBidiClassKernel',
  'getBidiRuns',
  'reorderBidiLine',
  'resolveBidiLevels',
] as const;

const CONTRACT_EXPORTS = [
  'compactBidiClassKernel',
  'createCompactBidiClassKernel',
  'disableTextBidiGuards',
  'enableTextBidiGuards',
  'explainBidiClassKernel',
  'getBidiRuns',
  'initializeCompactBidiClassKernel',
  'reorderBidiLine',
  'reportTextBidiCompactTableMiss',
  'resolveBidiLevels',
  'setTextBidiGuard',
] as const;

function generate(check = false): void {
  execFileSync(
    generatorPath,
    [
      'scripts/generate-rust-package.ts',
      '--crate',
      'flight-textbidi',
      '--crate-root',
      crateRoot,
      '--package',
      'textbidi',
      '--package-root',
      packageRoot,
      ...(check ? ['--check'] : []),
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function generationError(): string {
  try {
    generate(true);
    throw new Error('generation check unexpectedly succeeded');
  } catch (error) {
    return error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
  }
}

function handwrittenSources(): Map<string, string> {
  return new Map(
    readdirSync(packageSourceRoot)
      .filter((fileName) => fileName.endsWith('.ts') && !['contract.ts', 'index.ts'].includes(fileName))
      .map((fileName) => [fileName, readFileSync(join(packageSourceRoot, fileName), 'utf8')]),
  );
}

function withoutSourceProvenance(contents: string): string {
  return contents.replace(/^\/\/ Generated from .* by flight-compiler\.\n/, '');
}

describe('Textbidi export-only package generation', () => {
  beforeAll(() => {
    mkdirSync(crateRoot, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    cpSync(join(repositoryRoot, 'crates', 'flight-textbidi', 'Cargo.toml'), join(crateRoot, 'Cargo.toml'));
    cpSync(join(repositoryRoot, 'crates', 'flight-textbidi', 'src'), join(crateRoot, 'src'), { recursive: true });
    cpSync(join(repositoryRoot, 'crates', 'flight-textbidi', 'tests'), join(crateRoot, 'tests'), { recursive: true });
    cpSync(join(repositoryRoot, 'packages', 'textbidi', 'src'), packageSourceRoot, { recursive: true });
  });

  afterAll(() => {
    rmSync(fixtureRoot, { force: true, recursive: true });
  });

  it('derives complete contract and package-root lanes without rewriting target-native runtime sources', () => {
    const before = handwrittenSources();
    generate();

    expect(handwrittenSources()).toEqual(before);
    expect(getModulePublishedValueExports(join(packageSourceRoot, 'contract.ts')).sort()).toEqual(CONTRACT_EXPORTS);
    expect(getModulePublishedValueExports(join(packageSourceRoot, 'index.ts')).sort()).toEqual(PUBLIC_EXPORTS);
    expect(withoutSourceProvenance(readFileSync(join(packageSourceRoot, 'contract.ts'), 'utf8'))).toBe(
      withoutSourceProvenance(readFileSync(join(repositoryRoot, 'packages', 'textbidi', 'src', 'contract.ts'), 'utf8')),
    );
    expect(withoutSourceProvenance(readFileSync(join(packageSourceRoot, 'index.ts'), 'utf8'))).toBe(
      withoutSourceProvenance(readFileSync(join(repositoryRoot, 'packages', 'textbidi', 'src', 'index.ts'), 'utf8')),
    );
  }, 120_000);

  it('rejects drift in either generated lane and repairs it deterministically', () => {
    generate();
    const contractPath = join(packageSourceRoot, 'contract.ts');
    const indexPath = join(packageSourceRoot, 'index.ts');

    writeFileSync(indexPath, `${readFileSync(indexPath, 'utf8')}\n// stale root\n`);
    expect(generationError()).toContain('generated output is stale: index.ts');

    generate();
    writeFileSync(contractPath, `${readFileSync(contractPath, 'utf8')}\n// stale contract\n`);
    expect(generationError()).toContain('generated output is stale: contract.ts');

    generate();
    expect(() => generate(true)).not.toThrow();
  }, 120_000);
});
