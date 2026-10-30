import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = join(repositoryRoot, 'packages');
const crateName = 'flight-staging-fixture';
const packageName = 'staging-fixture';
const fixtureRoot = mkdtempSync(join(tmpdir(), 'flight-staging-generation-'));
const crateRoot = join(fixtureRoot, 'crate');
const packageRoot = join(fixtureRoot, 'package');
const stagingParent = join(fixtureRoot, 'tmp');
const sourcePath = join(crateRoot, 'src', 'value.rs');
const generatorPath = join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

interface GenerationRun {
  readonly code: number | null;
  readonly sawStaging: boolean;
  readonly stderr: string;
  readonly transientPackageEntries: readonly string[];
}

// Runs the generator as a child while this process scans packages/ the way repository scanners do,
// recording every entry that appears there and whether the child's private staging tree was observed.
function generateWhileScanning(): Promise<GenerationRun> {
  const baseline = new Set(readdirSync(packagesRoot));
  const transient = new Set<string>();
  let sawStaging = false;
  let stderr = '';
  const child = spawn(
    generatorPath,
    [
      'scripts/generate-rust-package.ts',
      '--crate',
      crateName,
      '--crate-root',
      crateRoot,
      '--package',
      packageName,
      '--package-root',
      packageRoot,
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, TEMP: stagingParent, TMP: stagingParent, TMPDIR: stagingParent },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let running = true;
  const scan = (): void => {
    if (!running) return;
    for (const entry of readdirSync(packagesRoot)) {
      if (!baseline.has(entry)) transient.add(entry);
    }
    if (stagingEntries().length > 0) sawStaging = true;
    setImmediate(scan);
  };
  scan();
  return new Promise((resolvePromise) => {
    child.on('close', (code) => {
      running = false;
      resolvePromise({ code, sawStaging, stderr, transientPackageEntries: [...transient].sort() });
    });
  });
}

// The child's own staging trees; other tools (tsx's cache, cargo) may also write under its temp directory.
function stagingEntries(): string[] {
  return readdirSync(stagingParent).filter((entry) => entry.startsWith('flight-generate-'));
}

function valueSource(rootOnly: string): string {
  return `//! flight-compiler: root-only ${rootOnly}

pub fn zeta_value() -> i32 {
    return 2;
}

pub fn alpha_value() -> i32 {
    return 1;
}
`;
}

describe('generate-rust-package staging', () => {
  beforeAll(() => {
    mkdirSync(join(crateRoot, 'src'), { recursive: true });
    mkdirSync(join(crateRoot, 'tests'), { recursive: true });
    mkdirSync(join(packageRoot, 'src'), { recursive: true });
    mkdirSync(stagingParent, { recursive: true });
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"
`,
    );
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), 'mod value;\npub mod contract;\npub use contract::*;\n');
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
  });

  afterAll(() => {
    rmSync(fixtureRoot, { force: true, recursive: true });
  });

  it('stages outside packages/, orders the staged package sources, and removes the staging tree', async () => {
    writeFileSync(sourcePath, valueSource('alphaValue'));

    const run = await generateWhileScanning();

    expect(run.stderr).not.toContain('Error');
    expect(run.code).toBe(0);
    expect(run.sawStaging).toBe(true);
    expect(run.transientPackageEntries).toEqual([]);
    expect(stagingEntries()).toEqual([]);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value.indexOf('export function alphaValue')).toBeGreaterThanOrEqual(0);
    expect(value.indexOf('export function alphaValue')).toBeLessThan(value.indexOf('export function zetaValue'));
  }, 120_000);

  it('removes the staging tree when generation fails', async () => {
    writeFileSync(sourcePath, valueSource('missingValue'));

    const run = await generateWhileScanning();

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('root export missingValue has no TypeScript contract symbol');
    expect(run.transientPackageEntries).toEqual([]);
    expect(stagingEntries()).toEqual([]);
  }, 120_000);
});
