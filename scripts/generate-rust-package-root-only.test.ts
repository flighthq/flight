import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crateName = 'flight-root-only-fixture';
const packageName = 'root-only-fixture';
const fixtureRoot = mkdtempSync(join(tmpdir(), 'flight-root-only-generation-'));
const crateRoot = join(fixtureRoot, 'crate');
const packageRoot = join(fixtureRoot, 'package');
const sourcePath = join(crateRoot, 'src', 'signal.rs');
const generatorPath = join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function signalBody(): string {
  return `pub struct Signal {
    pub value: i32,
}

pub struct ContractOnly {
    pub value: i32,
}

pub fn create_signal(value: i32) -> Signal {
    return Signal { value };
}
`;
}

function signalSource(target: string, docAttribute = false): string {
  const directive = docAttribute
    ? `#![doc = "flight-compiler: root-only ${target}"]`
    : `//! flight-compiler: root-only ${target}`;
  return `${directive}\n\n${signalBody()}`;
}

function generate(): void {
  execFileSync(
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
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function generationError(): string {
  try {
    generate();
    throw new Error('generation unexpectedly succeeded');
  } catch (error) {
    return error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
  }
}

describe('root-only package generation', () => {
  beforeAll(() => {
    mkdirSync(join(crateRoot, 'src'), { recursive: true });
    mkdirSync(join(crateRoot, 'tests'), { recursive: true });
    mkdirSync(join(packageRoot, 'src'), { recursive: true });
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"
`,
    );
    writeFileSync(
      join(crateRoot, 'src', 'lib.rs'),
      `mod signal;
pub mod contract;
pub use contract::*;
`,
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::signal::*;\n');
    writeFileSync(sourcePath, signalSource('Signal'));
  });

  afterAll(() => {
    rmSync(fixtureRoot, { force: true, recursive: true });
  });

  it('keeps the exact root smaller than the contract and rejects an unresolved exact-root target', () => {
    generate();

    const contract = readFileSync(join(packageRoot, 'src', 'contract.ts'), 'utf8');
    const root = readFileSync(join(packageRoot, 'src', 'index.ts'), 'utf8');
    expect(root).toContain("export type { Signal } from './contract.ts';");
    expect(root).not.toContain('ContractOnly');
    expect(root).not.toContain('createSignal');
    expect(contract).toContain('createSignal');
    expect(contract).toContain('ContractOnly');
    expect(contract).toContain('Signal');

    writeFileSync(sourcePath, signalSource('Signal', true));
    generate();
    const attributeRoot = readFileSync(join(packageRoot, 'src', 'index.ts'), 'utf8');
    expect(attributeRoot).toContain("export type { Signal } from './contract.ts';");
    expect(attributeRoot).not.toContain('ContractOnly');
    expect(attributeRoot).not.toContain('createSignal');

    writeFileSync(sourcePath, signalSource('Signal,,createSignal'));
    expect(generationError()).toContain('`flight-compiler: root-only` contains an empty export target');

    writeFileSync(
      sourcePath,
      `//! flight-compiler: root-only Signal\n#![doc = "flight-compiler: root-only createSignal"]\n\n${signalBody()}`,
    );
    expect(generationError()).toContain('duplicate `flight-compiler: root-only` directive');

    writeFileSync(sourcePath, signalSource('MissingSignal'));
    expect(generationError()).toContain('root export MissingSignal has no TypeScript contract symbol');
  }, 120_000);
});
