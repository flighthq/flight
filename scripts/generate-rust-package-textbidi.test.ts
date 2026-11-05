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

// The package's target-native runtime sources: every TypeScript module except the generated export lanes
// and modules the generator itself owns (a source promoted to generation carries the provenance header).
function handwrittenSources(): Map<string, string> {
  return new Map(
    readdirSync(packageSourceRoot)
      .filter((fileName) => fileName.endsWith('.ts') && !['contract.ts', 'index.ts'].includes(fileName))
      .map((fileName) => [fileName, readFileSync(join(packageSourceRoot, fileName), 'utf8')] as const)
      .filter(([, contents]) => !contents.startsWith('// Generated from ')),
  );
}

// The copied crate inherits package metadata, lints and dependencies from the repository workspace, so
// the fixture root becomes a minimal workspace carrying those sections: the repository's
// `[workspace.package]` and `[workspace.lints*]` tables verbatim, plus each inherited dependency with its
// path resolved back into the repository. Cargo target discovery then reads the copy as it reads the
// original crate.
function writeFixtureWorkspace(): void {
  const rootManifest = readFileSync(join(repositoryRoot, 'Cargo.toml'), 'utf8');
  const crateManifest = readFileSync(join(crateRoot, 'Cargo.toml'), 'utf8');
  const sections = new Map<string, string[]>();
  let current = '';
  for (const line of rootManifest.split('\n')) {
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header) current = header[1];
    const lines = sections.get(current) ?? [];
    lines.push(line);
    sections.set(current, lines);
  }
  const inherited = [...sections.keys()]
    .filter((name) => name === 'workspace.package' || name.startsWith('workspace.lints'))
    .map((name) => (sections.get(name) ?? []).join('\n').trimEnd());
  const dependencyNames = [...crateManifest.matchAll(/^([A-Za-z0-9_-]+)\s*=\s*\{[^}]*\bworkspace\s*=\s*true\b/gm)].map(
    (match) => match[1],
  );
  const dependencies = dependencyNames.map((name) => {
    const entry = (sections.get('workspace.dependencies') ?? []).find((line) => line.startsWith(`${name} =`));
    if (entry === undefined) throw new Error(`workspace dependency ${name} is not declared in the repository manifest`);
    return entry.replace(
      /path\s*=\s*"([^"]+)"/,
      (_match, path: string) => `path = ${JSON.stringify(join(repositoryRoot, path))}`,
    );
  });
  writeFileSync(
    join(fixtureRoot, 'Cargo.toml'),
    [
      '[workspace]',
      'members = ["crate"]',
      'resolver = "2"',
      '',
      ...inherited.flatMap((section) => [section, '']),
      '[workspace.dependencies]',
      ...dependencies,
      '',
    ].join('\n'),
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
    writeFixtureWorkspace();
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

  it('retains an edited curated package root verbatim instead of reporting it stale', () => {
    generate();
    const indexPath = join(packageSourceRoot, 'index.ts');

    // The package root is a curated manifest: generation retains an existing root's export routes
    // verbatim (the staging suite pins this), so an edited root is neither stale nor rewritten.
    const generatedRoot = readFileSync(indexPath, 'utf8');
    const curatedRoot = generatedRoot.replace('  resolveBidiLevels,\n', '');
    writeFileSync(indexPath, curatedRoot);
    expect(() => generate(true)).not.toThrow();
    generate();
    expect(readFileSync(indexPath, 'utf8')).toBe(curatedRoot);
    writeFileSync(indexPath, generatedRoot);
  }, 120_000);

  it('rejects contract lane drift and repairs it deterministically', () => {
    generate();
    const contractPath = join(packageSourceRoot, 'contract.ts');

    // The contract lane is fully generated, so any drift there is stale and regeneration repairs it.
    writeFileSync(contractPath, `${readFileSync(contractPath, 'utf8')}\n// stale contract\n`);
    expect(generationError()).toContain('generated output is stale: contract.ts');

    generate();
    expect(() => generate(true)).not.toThrow();
  }, 120_000);
});
