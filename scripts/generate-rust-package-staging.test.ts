import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectTypeScriptExportSymbols } from './generate-rust-package-exports.ts';

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
  readonly stdout: string;
  readonly transientPackageEntries: readonly string[];
}

// Runs the generator as a child while this process scans packages/ the way repository scanners do,
// recording every entry that appears there and whether the child's private staging tree was observed.
function generateWhileScanning(lenient = false, auditNative = false): Promise<GenerationRun> {
  const baseline = new Set(readdirSync(packagesRoot));
  const transient = new Set<string>();
  let sawStaging = false;
  let stderr = '';
  let stdout = '';
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
      ...(lenient ? ['--lenient'] : []),
      ...(auditNative ? ['--audit-native'] : []),
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, TEMP: stagingParent, TMP: stagingParent, TMPDIR: stagingParent },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
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
      resolvePromise({ code, sawStaging, stderr, stdout, transientPackageEntries: [...transient].sort() });
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

  it('carries explicit structural default construction through package generation', async () => {
    writeFileSync(
      sourcePath,
      `//! flight-compiler: default-object SpringConfig

#[derive(Default)]
pub struct SpringConfig {
    pub damping_ratio: f32,
    pub frequency: f32,
}

pub fn create_spring_config() -> SpringConfig {
    let mut out = SpringConfig::default();
    out.frequency = 2.0;
    return out;
}
`,
    );

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain('let out = { dampingRatio: 0, frequency: 0 };');
    expect(value).not.toContain('SpringConfig.default_()');
  }, 120_000);

  it('removes the staging tree when generation fails', async () => {
    writeFileSync(sourcePath, valueSource('missingValue'));

    const run = await generateWhileScanning();

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('root export missingValue has no TypeScript contract symbol');
    expect(run.transientPackageEntries).toEqual([]);
    expect(stagingEntries()).toEqual([]);
  }, 120_000);

  it('preserves the exact curated root including auxiliary compatibility exports', async () => {
    writeFileSync(
      join(crateRoot, 'src', 'lib.rs'),
      'mod compatibility;\nmod types;\nmod value;\npub mod contract;\npub use contract::{alpha_value, MissingType};\n',
    );
    writeFileSync(
      join(crateRoot, 'src', 'contract.rs'),
      'pub use super::compatibility::MissingType;\npub use super::value::*;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'compatibility.rs'), 'pub use crate::types::MissingType;\n');
    writeFileSync(join(crateRoot, 'src', 'types.rs'), '//! flight-compiler: rust-only\npub struct MissingType;\n');
    writeFileSync(
      sourcePath,
      `pub fn zeta_value() -> i32 { return 2; }
pub fn alpha_value() -> i32 { return 1; }
`,
    );
    writeFileSync(join(packageRoot, 'src', 'compat.ts'), 'export interface MissingType { value: number; }\n');
    writeFileSync(join(packageRoot, 'src', 'compatibility.ts'), "export type { MissingType } from './compat.ts';\n");
    writeFileSync(
      join(packageRoot, 'src', 'index.ts'),
      "export type { MissingType } from './compatibility.ts';\nexport { alphaValue } from './contract.ts';\n",
    );

    const first = await generateWhileScanning();
    const second = await generateWhileScanning();

    expect(first.code, first.stderr).toBe(0);
    expect(second.code, second.stderr).toBe(0);
    const root = readFileSync(join(packageRoot, 'src', 'index.ts'), 'utf8');
    expect(root).toContain("export { alphaValue } from './contract.ts';");
    expect(root).not.toContain('zetaValue');
    expect(root).toContain("export type { MissingType } from './compatibility.ts';");
    expect(readFileSync(join(packageRoot, 'src', 'contract.ts'), 'utf8')).toContain(
      "export type { MissingType } from './compatibility.ts';",
    );
  }, 120_000);

  it('forwards lenient production generation', async () => {
    writeFileSync(
      sourcePath,
      `//! flight-compiler: root-only beginSpan

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

pub fn begin_span(channel: Option<String>) -> bool {
    let started = catch_unwind(AssertUnwindSafe(|| {}));
    if let Err(error) = started {
        let _ = catch_unwind(AssertUnwindSafe(|| {
            return channel.is_none();
        }));
        resume_unwind(error);
    }
    return channel.is_none();
}

pub fn measure_span(value: &dyn std::any::Any) -> bool {
    return value.type_id() == std::any::TypeId::of::<u32>();
}
`,
    );
    const established = `export function beginSpan(channel: string | null = null): boolean {
  return channel === null;
}

export function measureSpan(_value: unknown): boolean {
  return true;
}
`;
    writeFileSync(join(packageRoot, 'src', 'value.ts'), established);

    const first = await generateWhileScanning(true);
    const generatedPaths = ['contract.ts', 'index.ts', 'value.generated.ts', 'value.native.ts', 'value.ts'];
    const firstSources = new Map(
      generatedPaths.map((fileName) => [fileName, readFileSync(join(packageRoot, 'src', fileName), 'utf8')]),
    );
    const second = await generateWhileScanning(true);

    expect(first.code, first.stderr).toBe(0);
    expect(second.code, second.stderr).toBe(0);
    expect(first.stderr).toContain('lenient: 1 items skipped');
    expect(second.stderr).toContain('lenient: 1 items skipped');
    for (const [fileName, firstSource] of firstSources) {
      expect(readFileSync(join(packageRoot, 'src', fileName), 'utf8')).toBe(firstSource);
    }
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect([...collectTypeScriptExportSymbols(value).keys()].sort()).toEqual(
      [...collectTypeScriptExportSymbols(established).keys()].sort(),
    );
    expect(value).toContain("export { beginSpan } from './value.generated.ts';");
    expect(value).toContain("export { measureSpan } from './value.native.ts';");
    expect(readFileSync(join(packageRoot, 'src', 'value.generated.ts'), 'utf8')).toContain(
      'export function beginSpan(channel: string | null = null): boolean',
    );
    const generated = readFileSync(join(packageRoot, 'src', 'value.generated.ts'), 'utf8');
    expect(generated).toContain('try {');
    expect(generated).toContain('} catch (error) {');
    expect(generated).toContain('} catch {}');
    expect(generated).toContain('throw error;');
    const native = readFileSync(join(packageRoot, 'src', 'value.native.ts'), 'utf8');
    expect(native).toContain('export function measureSpan');
  }, 120_000);

  it('keeps a skipped private helper in the native overlay without publishing it', async () => {
    writeFileSync(
      sourcePath,
      `//! flight-compiler: root-only goodValue

pub fn good_value(value: i32) -> i32 {
    if unsupported_value(&value) {
        return value + 1;
    }
    return value;
}

fn unsupported_value(value: &dyn std::any::Any) -> bool {
    return value.type_id() == std::any::TypeId::of::<u32>();
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.native.ts'),
      `export function goodValue(value: number): number { return unsupportedValue(value) ? value + 1 : value; }
function unsupportedValue(_value: unknown): boolean { return true; }
`,
    );

    const run = await generateWhileScanning(true);

    expect(run.code, run.stderr).toBe(0);
    const wrapper = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(wrapper).not.toContain('unsupportedValue');
    expect(readFileSync(join(packageRoot, 'src', 'value.generated.ts'), 'utf8')).toContain(
      "import { unsupportedValue } from './value.native.ts';",
    );
    expect(readFileSync(join(packageRoot, 'src', 'value.native.ts'), 'utf8')).toContain(
      'flight-compiler: native fallback exports\nexport { unsupportedValue };',
    );
  }, 120_000);

  it('keeps test generation strict when production generation is lenient', async () => {
    writeFileSync(
      join(crateRoot, 'tests', 'strict_test.rs'),
      `use crate::contract::*;

mod strict_tests {
    use super::*;

    #[test]
    fn unsupported_test() {
        let value: &dyn std::any::Any = &1_u32;
        assert!(value.type_id() == std::any::TypeId::of::<u32>());
    }
}
`,
    );

    const run = await generateWhileScanning(true);

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('unsupported Rust method call `.type_id()`');
  }, 120_000);

  it('selects only referenced helpers from an explicitly owned crate-local test support wildcard', async () => {
    rmSync(join(crateRoot, 'tests', 'strict_test.rs'), { force: true });
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
    writeFileSync(sourcePath, 'pub fn fixture_value() -> i32 { return 1; }\n');
    const supportPath = join(crateRoot, 'tests', 'support.rs');
    const testPath = join(crateRoot, 'tests', 'support_selection_test.rs');
    writeFileSync(
      supportPath,
      `pub fn selected_helper() -> i32 { return 3; }
pub fn shadowed_helper() -> i32 { return 99; }
pub fn unused_unsupported(value: &dyn std::any::Any) -> bool {
    return value.type_id() == std::any::TypeId::of::<u32>();
}
`,
    );
    writeFileSync(
      testPath,
      `use crate::support::*;

#[test]
fn selects_only_unshadowed_helpers() {
    let shadowed_helper = 7;
    assert_eq!(shadowed_helper, 7);
    assert_eq!(selected_helper(), 3);
}
`,
    );

    try {
      const run = await generateWhileScanning();

      expect(run.code, run.stderr).toBe(0);
      const test = readFileSync(join(packageRoot, 'src', 'supportSelection.test.ts'), 'utf8');
      expect(test).toContain('function selectedHelper(): number');
      expect(test).not.toContain('function shadowedHelper');
      expect(test).not.toContain('unusedUnsupported');
    } finally {
      rmSync(testPath, { force: true });
      rmSync(supportPath, { force: true });
    }
  }, 120_000);

  it('keeps the established TypeScript contract owner for a dependency re-export', async () => {
    rmSync(join(crateRoot, 'tests', 'strict_test.rs'), { force: true });
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"

[dependencies]
flight-host = "0.0.0"
`,
    );
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), 'mod value;\npub mod contract;\npub use contract::*;\n');
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `use flight_host::BackendOperationExplanation;

pub fn echo_explanation(value: BackendOperationExplanation) -> BackendOperationExplanation {
    return value;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { BackendOperationExplanation } from '@flighthq/types/contract';

export function echoExplanation(value: BackendOperationExplanation): BackendOperationExplanation {
  return value;
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { echoExplanation } from './contract.ts';\n");

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain("import type { BackendOperationExplanation } from '@flighthq/types/contract';");
    expect(value).not.toContain("from '@flighthq/host/contract'");
  }, 120_000);

  it('replaces generated test-local records with their established external contract types', async () => {
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
    writeFileSync(sourcePath, 'pub fn fixture_value() -> i32 { return 1; }\n');
    const testPath = join(crateRoot, 'tests', 'value_test.rs');
    writeFileSync(
      testPath,
      `struct NodeAny {
    name: String,
}

struct FlightDocumentLayoutBinding {
    targets: Vec<NodeAny>,
}

#[test]
fn consumes_the_established_binding() {
    let binding = FlightDocumentLayoutBinding {
        targets: vec![NodeAny { name: "root".to_string() }],
    };
    assert_eq!(binding.targets[0].name, "root");
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.test.ts'),
      `import type { FlightDocumentLayoutBinding, NodeAny } from '@flighthq/types/contract';

const target = { name: 'root' } as NodeAny;
const binding: FlightDocumentLayoutBinding = { targets: [target], tree: { nodes: [] } };
void binding;
`,
    );

    try {
      const run = await generateWhileScanning();

      expect(run.code, run.stderr).toBe(0);
      const test = readFileSync(join(packageRoot, 'src', 'value.test.ts'), 'utf8');
      expect(test).toContain("import type { FlightDocumentLayoutBinding, NodeAny } from '@flighthq/types/contract';");
      expect(test).toContain('const binding: FlightDocumentLayoutBinding =');
      expect(test).not.toContain('interface FlightDocumentLayoutBinding');
      expect(test).not.toContain('interface NodeAny');
    } finally {
      rmSync(testPath, { force: true });
      rmSync(join(packageRoot, 'src', 'value.test.ts'), { force: true });
    }
  }, 120_000);

  it('applies dependency-owned nullable return metadata during package generation', async () => {
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"

[dependencies]
flight-bitmap = "0.0.0"
`,
    );
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), 'mod value;\npub mod contract;\npub use contract::*;\n');
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `use flight_bitmap::parse_bitmap_fingerprint;

pub fn recognizes_bitmap_fingerprint(text: &str) -> bool {
    let Some(_fingerprint) = parse_bitmap_fingerprint(text) else {
        return false;
    };
    return true;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import { parseBitmapFingerprint } from '@flighthq/bitmap/contract';

export function recognizesBitmapFingerprint(text: string): boolean {
  const fingerprint = parseBitmapFingerprint(text);
  return fingerprint !== null;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'index.ts'),
      "export { recognizesBitmapFingerprint } from './contract.ts';\n",
    );

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain('parseBitmapFingerprint(text) ?? undefined');
    expect(value).toContain('if (_fingerprint === undefined)');
  }, 120_000);

  it('preserves an established nullable callable alias while ordinary callables remain undefined', async () => {
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
    writeFileSync(
      sourcePath,
      `pub type Resolver = fn() -> Option<i32>;
pub type OrdinaryResolver = fn() -> Option<i32>;
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `export type Resolver = () => number | null;
export type OrdinaryResolver = () => number | undefined;
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'index.ts'),
      "export type { OrdinaryResolver, Resolver } from './contract.ts';\n",
    );

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain('export type Resolver = () => number | null;');
    expect(value).toContain('export type OrdinaryResolver = () => number | undefined;');
  }, 120_000);

  it('preserves target-native nullable return ownership through generated tests', async () => {
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
      '//! flight-compiler: target-native\nmod value;\npub mod contract;\npub use contract::*;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use value::*;\n');
    writeFileSync(
      sourcePath,
      `//! flight-compiler: target-native

pub fn find_value(present: bool) -> Option<i32> {
    if present {
        return Some(7);
    }
    return None;
}
`,
    );
    const testPath = join(crateRoot, 'tests', 'value_test.rs');
    writeFileSync(
      testPath,
      `mod nullable_return_owner {
    #[test]
    fn keeps_the_owner_visible_to_test_generation() {
        assert!(true);
    }
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `export function findValue(present: boolean): number | null {
  return present ? 7 : null;
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { findValue } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { findValue } from './contract.ts';\n");

    const run = await generateWhileScanning();
    rmSync(testPath, { force: true });

    expect(run.code, run.stderr).toBe(0);
    const test = readFileSync(join(packageRoot, 'src', 'value.test.ts'), 'utf8');
    expect(test).toContain("describe('nullableReturnOwner'");
    expect(test).toContain('expect(true).toBe(true);');
  }, 120_000);

  it('passes canonical type-only string-union representation metadata to the compiler', async () => {
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"
`,
    );
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), '//! flight-compiler: target-native\nmod types;\nmod value;\n');
    rmSync(join(crateRoot, 'src', 'contract.rs'), { force: true });
    writeFileSync(
      join(crateRoot, 'src', 'types.rs'),
      `//! flight-compiler: rust-only
pub enum AccessibilityLiveness {
    Polite,
    Assertive,
}
`,
    );
    writeFileSync(
      sourcePath,
      `use crate::types::AccessibilityLiveness;

pub fn default_liveness() -> AccessibilityLiveness {
    return AccessibilityLiveness::Polite;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { AccessibilityLiveness } from '@flighthq/types/contract';

export function defaultLiveness(): AccessibilityLiveness {
  return 'polite';
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { defaultLiveness } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { defaultLiveness } from './contract.ts';\n");

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain("import type { AccessibilityLiveness } from '@flighthq/types/contract';");
    expect(value).toContain("return 'polite';");
    expect(value).not.toContain('AccessibilityLiveness.Polite');
  }, 120_000);

  it('passes type-only string-union metadata through outcome construction', async () => {
    rmSync(join(packageRoot, 'src', 'value.generated.ts'), { force: true });
    rmSync(join(packageRoot, 'src', 'value.native.ts'), { force: true });
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"
`,
    );
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), '//! flight-compiler: target-native\nmod types;\nmod value;\n');
    rmSync(join(crateRoot, 'src', 'contract.rs'), { force: true });
    writeFileSync(
      join(crateRoot, 'src', 'types.rs'),
      `//! flight-compiler: rust-only
pub enum ShellExternalReason {
    BlockedScheme,
    Ok,
    OperationFailed,
    PopupBlocked,
}

pub struct ShellExternalOutcome {
    pub reason: ShellExternalReason,
}
`,
    );
    writeFileSync(
      sourcePath,
      `use crate::types::{ShellExternalOutcome, ShellExternalReason};

pub fn blocked_outcome() -> ShellExternalOutcome {
    return ShellExternalOutcome {
        reason: ShellExternalReason::BlockedScheme,
    };
}

pub fn unsupported_probe(value: &dyn std::any::Any) -> bool {
    return value.type_id() == std::any::TypeId::of::<u32>();
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { ShellExternalOutcome, ShellExternalReason } from '@flighthq/types/contract';

export function blockedOutcome(): ShellExternalOutcome {
  return { reason: 'blocked-scheme' as ShellExternalReason };
}

export function unsupportedProbe(_value: unknown): boolean {
  return true;
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { blockedOutcome } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { blockedOutcome } from './contract.ts';\n");

    const first = await generateWhileScanning(true);
    const second = await generateWhileScanning(true);

    expect(first.code, first.stderr).toBe(0);
    expect(second.code, second.stderr).toBe(0);
    expect(first.stderr).toContain('lenient: 1 items skipped');
    expect(second.stderr).toContain('lenient: 1 items skipped');
    const value = readFileSync(join(packageRoot, 'src', 'value.generated.ts'), 'utf8');
    expect(value).toContain("return { reason: 'blocked-scheme' };");
    expect(value).not.toContain('ShellExternalReason.BlockedScheme');
  }, 120_000);

  it('preserves an explicit Rust-variant string-union representation through the compiler CLI', async () => {
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"
`,
    );
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), '//! flight-compiler: target-native\nmod types;\nmod value;\n');
    rmSync(join(crateRoot, 'src', 'contract.rs'), { force: true });
    writeFileSync(
      join(crateRoot, 'src', 'types.rs'),
      `//! flight-compiler: rust-only
//! flight-compiler: string-union AnimationLoopMode=rust-variant

pub enum AnimationLoopMode {
    PingPong,
    Repeat,
}
`,
    );
    writeFileSync(
      sourcePath,
      `use crate::types::AnimationLoopMode;

pub fn default_loop_mode() -> AnimationLoopMode {
    return AnimationLoopMode::PingPong;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { AnimationLoopMode } from '@flighthq/types/contract';

export function defaultLoopMode(): AnimationLoopMode {
  return 'PingPong';
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { defaultLoopMode } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { defaultLoopMode } from './contract.ts';\n");

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain("import type { AnimationLoopMode } from '@flighthq/types/contract';");
    expect(value).toContain("return 'PingPong';");
    expect(value).not.toContain("return 'pingPong';");
  }, 120_000);

  it('passes canonical string-union representation and owner metadata through generated tests', async () => {
    rmSync(join(crateRoot, 'tests', 'strict_test.rs'), { force: true });
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
      '//! flight-compiler: target-native\nmod types;\nmod value;\npub mod contract;\npub use contract::*;\n',
    );
    writeFileSync(
      join(crateRoot, 'src', 'contract.rs'),
      'pub use super::types::ShellExternalReason;\npub use super::value::blocked_reason;\n',
    );
    writeFileSync(
      join(crateRoot, 'src', 'types.rs'),
      `//! flight-compiler: rust-only

pub enum ShellExternalReason {
    BlockedScheme,
    Ok,
    OperationFailed,
    PopupBlocked,
}
`,
    );
    writeFileSync(
      sourcePath,
      `use crate::types::ShellExternalReason;

pub fn blocked_reason() -> ShellExternalReason {
    return ShellExternalReason::BlockedScheme;
}
`,
    );
    writeFileSync(
      join(crateRoot, 'tests', 'value_test.rs'),
      `use crate::contract::*;

mod shell_external_reason {
    use super::*;

    #[test]
    fn returns_the_blocked_scheme_literal() {
        let reason: ShellExternalReason = ShellExternalReason::BlockedScheme;
        assert_eq!(reason, ShellExternalReason::BlockedScheme);
    }
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { ShellExternalReason } from '@flighthq/types/contract';

export function blockedReason(): ShellExternalReason {
  return 'blocked-scheme';
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.test.ts'),
      `import type { ShellExternalReason } from '@flighthq/types/contract';

describe('ShellExternalReason', () => {
  it('returns the blocked scheme literal', () => {
    const reason: ShellExternalReason = 'blocked-scheme';
    expect(reason).toEqual('blocked-scheme');
  });
});
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { blockedReason } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { blockedReason } from './contract.ts';\n");

    const run = await generateWhileScanning();
    rmSync(join(crateRoot, 'tests', 'value_test.rs'), { force: true });

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain("import type { ShellExternalReason } from '@flighthq/types/contract';");
    expect(value).toContain("return 'blocked-scheme';");
    const test = readFileSync(join(packageRoot, 'src', 'value.test.ts'), 'utf8');
    expect(test).toContain("import type { ShellExternalReason } from '@flighthq/types/contract';");
    expect(test).toContain("const reason: ShellExternalReason = 'blocked-scheme';");
    expect(test).toContain("expect(reason).toEqual('blocked-scheme');");
    expect(test).not.toContain('ShellExternalReason.BlockedScheme');
  }, 120_000);

  it('finds a test-named string union owner in production imports and refuses an unproven Rust style', async () => {
    const statusEnum = `pub enum Physics2DAbiExecutionStatus {
    BusyWorld,
    Complete,
    InvalidBuffer,
    InvalidCommand,
    MissingBody,
    MissingCollider,
    MissingJoint,
    RejectedMutation,
    StaleWorld,
    UnsupportedJoint,
    UnsupportedShape,
}
`;
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
      '//! flight-compiler: target-native\nmod types;\nmod value;\npub mod contract;\npub use contract::*;\n',
    );
    writeFileSync(
      join(crateRoot, 'src', 'contract.rs'),
      'pub use super::types::Physics2DAbiExecutionStatus;\npub use super::value::complete_status;\n',
    );
    writeFileSync(
      sourcePath,
      `//! flight-compiler: target-native

use crate::types::Physics2DAbiExecutionStatus;

pub fn complete_status() -> Physics2DAbiExecutionStatus {
    return Physics2DAbiExecutionStatus::Complete;
}
`,
    );
    const testPath = join(crateRoot, 'tests', 'value_test.rs');
    writeFileSync(
      testPath,
      `use crate::contract::*;

mod complete_status {
    use super::*;

    #[test]
    fn is_complete() {
        assert_eq!(complete_status(), Physics2DAbiExecutionStatus::Complete);
        assert_ne!(complete_status(), Physics2DAbiExecutionStatus::InvalidBuffer);
    }
}
`,
    );
    // The production module names the canonical type-only owner; the handwritten test never did.
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { Physics2DAbiExecutionStatus } from '@flighthq/types/contract';

export function completeStatus(): Physics2DAbiExecutionStatus {
  return 'Complete';
}
`,
    );
    const handwrittenTest = `import { completeStatus } from './value.ts';

describe('completeStatus', () => {
  it('is complete', () => {
    expect(completeStatus()).toBe('Complete');
  });
});
`;
    writeFileSync(join(packageRoot, 'src', 'value.test.ts'), handwrittenTest);
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { completeStatus } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { completeStatus } from './contract.ts';\n");

    try {
      writeFileSync(join(crateRoot, 'src', 'types.rs'), `//! flight-compiler: rust-only\n\n${statusEnum}`);
      const unproven = await generateWhileScanning();
      expect(unproven.code).not.toBe(0);
      expect(unproven.stderr).toContain(
        'external TypeScript string union `Physics2DAbiExecutionStatus` does not match the literals of its Rust enum',
      );

      writeFileSync(
        join(crateRoot, 'src', 'types.rs'),
        `//! flight-compiler: rust-only\n//! flight-compiler: string-union Physics2DAbiExecutionStatus=rust-variant\n\n${statusEnum}`,
      );
      writeFileSync(join(packageRoot, 'src', 'value.test.ts'), handwrittenTest);
      const run = await generateWhileScanning();
      expect(run.code, run.stderr).toBe(0);
      const test = readFileSync(join(packageRoot, 'src', 'value.test.ts'), 'utf8');
      expect(test).toContain("expect(completeStatus()).toEqual('Complete');");
      expect(test).toContain("expect(completeStatus()).not.toEqual('InvalidBuffer');");
      expect(test).not.toContain('Physics2DAbiExecutionStatus');
    } finally {
      rmSync(testPath, { force: true });
      rmSync(join(crateRoot, 'src', 'types.rs'), { force: true });
    }
  }, 240_000);

  it('propagates a target-native nullable return owner into generated tests', async () => {
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
      '//! flight-compiler: target-native\nmod value;\npub mod contract;\npub use contract::*;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `//! flight-compiler: target-native

pub fn get_optional(found: bool) -> Option<i32> {
    if found { return Some(1); }
    return None;
}
`,
    );
    const testPath = join(crateRoot, 'tests', 'value_test.rs');
    writeFileSync(
      testPath,
      `use crate::*;

mod get_optional {
    use super::*;

    #[test]
    fn reports_absence_as_null() {
        assert!(get_optional(false).is_none());
    }
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `export function getOptional(found: boolean): number | null {
  return found ? 1 : null;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.test.ts'),
      `import { getOptional } from './value.ts';

describe('getOptional', () => {
  it('reports absence as null', () => {
    expect(getOptional(false)).toBeNull();
  });
});
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { getOptional } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { getOptional } from './contract.ts';\n");

    try {
      const run = await generateWhileScanning();

      expect(run.code, run.stderr).toBe(0);
      const test = readFileSync(join(packageRoot, 'src', 'value.test.ts'), 'utf8');
      expect(test).toContain('expect(getOptional(false) === null).toBe(true);');
      expect(test).not.toContain('getOptional(false) === undefined');
    } finally {
      rmSync(testPath, { force: true });
      rmSync(join(packageRoot, 'src', 'value.test.ts'), { force: true });
    }
  }, 120_000);

  it('refuses conflicting target-native nullable return owners', async () => {
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
      '//! flight-compiler: target-native\nmod shadow;\nmod value;\npub mod contract;\npub use contract::*;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `//! flight-compiler: target-native

pub fn get_optional(found: bool) -> Option<i32> {
    if found { return Some(1); }
    return None;
}
`,
    );
    const shadowPath = join(crateRoot, 'src', 'shadow.rs');
    writeFileSync(
      shadowPath,
      `//! flight-compiler: target-native

pub fn get_optional(found: bool) -> Option<i32> {
    if found { return Some(2); }
    return None;
}
`,
    );
    const testPath = join(crateRoot, 'tests', 'value_test.rs');
    writeFileSync(
      testPath,
      `use crate::*;

#[test]
fn reports_absence_as_null() {
    assert!(get_optional(false).is_none());
}
`,
    );
    for (const name of ['value', 'shadow']) {
      writeFileSync(
        join(packageRoot, 'src', `${name}.ts`),
        `export function getOptional(found: boolean): number | null {
  return found ? 1 : null;
}
`,
      );
    }
    writeFileSync(join(packageRoot, 'src', 'value.test.ts'), "import { getOptional } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { getOptional } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { getOptional } from './contract.ts';\n");

    try {
      const run = await generateWhileScanning();

      expect(run.code).not.toBe(0);
      expect(run.stderr).toContain('TypeScript nullable Option return getOptional has conflicting Rust owners');
    } finally {
      rmSync(shadowPath, { force: true });
      rmSync(testPath, { force: true });
      rmSync(join(packageRoot, 'src', 'shadow.ts'), { force: true });
      rmSync(join(packageRoot, 'src', 'value.test.ts'), { force: true });
    }
  }, 120_000);

  it('coalesces Effects-GL nullable return ownership across target-native audit modules', async () => {
    const secondSourcePath = join(crateRoot, 'src', 'second.rs');
    const renderGlCrateRoot = join(repositoryRoot, 'crates', 'flight-render-gl').replaceAll('\\', '/');
    writeFileSync(
      join(crateRoot, 'Cargo.toml'),
      `[package]
name = "${crateName}"
version = "0.0.0"
edition = "2024"

[dependencies]
flight-render-gl = { path = "${renderGlCrateRoot}" }
`,
    );
    writeFileSync(
      join(crateRoot, 'src', 'lib.rs'),
      '//! flight-compiler: target-native\nmod second;\nmod value;\npub mod contract;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::second::*;\npub use super::value::*;\n');
    writeFileSync(sourcePath, '//! flight-compiler: target-native\npub fn first_value() -> i32 { return 1; }\n');
    writeFileSync(secondSourcePath, '//! flight-compiler: target-native\npub fn second_value() -> i32 { return 2; }\n');
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { GlRenderState } from '@flighthq/types/contract';

export function firstValue(_state?: Readonly<GlRenderState>): number {
  return 1;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'second.ts'),
      `import type { GlRenderStateOptions } from '@flighthq/types/contract';

export function secondValue(_options?: Readonly<GlRenderStateOptions>): number {
  return 2;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'contract.ts'),
      "export * from './second.ts';\nexport * from './value.ts';\n",
    );
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export * from './contract.ts';\n");

    try {
      const run = await generateWhileScanning(false, true);

      expect(run.code, run.stderr).toBe(0);
      expect(run.stderr).not.toContain('conflicting Rust owners');
      expect(run.stdout).toContain('"compilerClean": 2');
      expect(run.stdout).not.toContain('GlCompressedTextureDecoder');
    } finally {
      rmSync(secondSourcePath, { force: true });
      rmSync(join(packageRoot, 'src', 'second.ts'), { force: true });
    }
  }, 120_000);

  it('passes established TypeScript position representations through the compiler CLI', async () => {
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
      '//! flight-compiler: target-native\npub mod contract;\nmod native_target;\nmod types;\nmod value;\nmod zz_native_only;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::types::*;\npub use super::value::*;\n');
    writeFileSync(
      join(crateRoot, 'src', 'types.rs'),
      `//! flight-compiler: rust-only
pub type AnimationPlayerRef = usize;
pub type TargetRef = usize;

pub struct AnimationStateMachine {
    pub transition_from_state_index: Option<usize>,
    pub transition_to_state_index: Option<usize>,
}
`,
    );
    writeFileSync(
      sourcePath,
      `use crate::types::{AnimationPlayerRef, AnimationStateMachine};

pub fn advance(players: &[AnimationPlayerRef]) -> AnimationPlayerRef {
    return players[0];
}

pub fn clear_transition(machine: &mut AnimationStateMachine) {
    machine.transition_from_state_index = None;
    machine.transition_to_state_index = None;
}

pub fn maybe_index(found: bool) -> Option<usize> {
    if found { return Some(1); }
    return None;
}

pub fn end_span(timer: Option<&AnimationPlayerRef>) -> bool {
    return timer.is_none();
}

pub fn begin_span(channel: Option<String>) -> bool {
    return channel.is_none();
}

pub fn mark_label(label: Option<&str>, channel: Option<String>) -> bool {
    return label.is_none() || channel.is_none();
}
`,
    );
    writeFileSync(
      join(crateRoot, 'src', 'native_target.rs'),
      `//! flight-compiler: target-native
use crate::types::TargetRef;

pub fn echo_target(target: TargetRef) -> TargetRef {
    return target;
}
`,
    );
    writeFileSync(
      join(crateRoot, 'src', 'zz_native_only.rs'),
      `//! flight-compiler: target-native
compile_error!("unrelated target-native modules must not be probed for resolved alias metadata");
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { AnimationPlayer, AnimationStateMachine } from '@flighthq/types/contract';

export function advance(players: readonly AnimationPlayer[]): AnimationPlayer {
  return players[0];
}

export function clearTransition(machine: AnimationStateMachine): void {
  machine.transitionFromStateIndex = null;
  machine.transitionToStateIndex = null;
}

export function maybeIndex(found: boolean): number | null {
  return found ? 1 : null;
}

export function endSpan(timer: Readonly<AnimationPlayer> | null): boolean {
  return timer === null;
}

export function beginSpan(channel: string | null = null): boolean {
  return channel === null;
}

export function markLabel(label?: string, channel: string | null = null): boolean {
  return label === undefined || channel === null;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'nativeTarget.ts'),
      `export function echoTarget(target: unknown): unknown {
  return target;
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'zzNativeOnly.ts'), 'export const nativeOnly = true;\n');
    const aliasTestPath = join(crateRoot, 'tests', 'alias_test.rs');
    writeFileSync(
      aliasTestPath,
      `use flight_staging_fixture::contract::*;

fn consume_target(target: TargetRef) {
    drop(target);
}

#[test]
fn keeps_the_existing_target_representation() {
    assert!(true);
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { advance } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { advance } from './contract.ts';\n");

    const run = await generateWhileScanning();
    rmSync(aliasTestPath, { force: true });

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain("import type { AnimationPlayer } from '@flighthq/types/contract';");
    expect(value).toContain('players: Readonly<AnimationPlayer[]>');
    expect(value).toContain('machine.transitionFromStateIndex = null;');
    expect(value).toContain('machine.transitionToStateIndex = null;');
    expect(value).toContain('function maybeIndex(found: boolean): number | null');
    expect(value).toContain('return null;');
    expect(value).toContain('function endSpan(timer: Readonly<AnimationPlayer> | null): boolean');
    expect(value).toContain('timer === null');
    expect(value).toContain('function beginSpan(channel: string | null = null): boolean');
    expect(value).toContain('channel === null');
    expect(value).toContain('function markLabel(label?: string, channel: string | null = null): boolean');
    expect(value).toContain('label === undefined');
    expect(value).not.toContain('AnimationPlayerRef');
    expect(value).not.toContain('TargetRef');
    const test = readFileSync(join(packageRoot, 'src', 'alias.test.ts'), 'utf8');
    expect(test).toContain('function consumeTarget(target: unknown): void');
    expect(test).not.toContain('TargetRef');
  }, 120_000);

  it('refuses conflicting target-native array parameter owners', async () => {
    writeFileSync(
      join(crateRoot, 'src', 'lib.rs'),
      '//! flight-compiler: target-native\nmod shadow;\nmod value;\npub mod contract;\npub use contract::*;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `//! flight-compiler: target-native

pub fn read_ids(ids: &[i16]) -> i16 {
    return ids[0];
}
`,
    );
    const shadowPath = join(crateRoot, 'src', 'shadow.rs');
    writeFileSync(
      shadowPath,
      `//! flight-compiler: target-native

pub fn read_ids(ids: &[i16]) -> i16 {
    return ids[0];
}
`,
    );
    for (const name of ['value', 'shadow']) {
      writeFileSync(
        join(packageRoot, 'src', `${name}.ts`),
        `export function readIds(ids: ArrayLike<number>): number {
  return ids[0];
}
`,
      );
    }
    const testPath = join(crateRoot, 'tests', 'value_test.rs');
    writeFileSync(
      testPath,
      `use crate::*;

#[test]
fn reads_ids() {
    let ids = vec![1_i16];
    assert_eq!(read_ids(&ids), 1);
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'value.test.ts'), "import { readIds } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { readIds } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { readIds } from './contract.ts';\n");

    try {
      const run = await generateWhileScanning();

      expect(run.code).not.toBe(0);
      expect(run.stderr).toContain('TypeScript array parameter readIds.ids has conflicting Rust owners');
    } finally {
      rmSync(shadowPath, { force: true });
      rmSync(testPath, { force: true });
      rmSync(join(packageRoot, 'src', 'shadow.ts'), { force: true });
      rmSync(join(packageRoot, 'src', 'value.test.ts'), { force: true });
    }
  }, 120_000);

  it('preserves established numeric slice and mutable f32 buffer parameter representations', async () => {
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), 'pub mod contract;\nmod value;\npub use contract::*;\n');
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `pub fn resolve_buffers(out: &mut [f32], intrinsic_sizes: &[f32], owned: Vec<f32>) {
    out[0] = intrinsic_sizes[0] + owned[0];
}

pub fn read_tile_ids(ids: &[i16], ordinary: &[i16]) -> i16 {
    return ids[0] + ordinary[0];
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `export function resolveBuffers(out: Float32Array, intrinsicSizes: ArrayLike<number>, owned: number[]): void {
  out[0] = intrinsicSizes[0] + owned[0];
}

export function readTileIds(ids: ArrayLike<number>, ordinary: Readonly<number[]>): number {
  return ids[0] + ordinary[0];
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'contract.ts'),
      "export { readTileIds, resolveBuffers } from './value.ts';\n",
    );
    writeFileSync(
      join(packageRoot, 'src', 'index.ts'),
      "export { readTileIds, resolveBuffers } from './contract.ts';\n",
    );

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain(
      'function resolveBuffers(out: Float32Array, intrinsicSizes: ArrayLike<number>, owned: number[]): void',
    );
    expect(value).toContain('function readTileIds(ids: ArrayLike<number>, ordinary: Readonly<number[]>): number');
  }, 120_000);

  it('preserves contract-proven Uint8Array parameters, returns, and fields only', async () => {
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), 'pub mod contract;\nmod value;\npub use contract::*;\n');
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `pub struct Packet {
    pub bytes: Vec<u8>,
    pub ordinary: Vec<u8>,
}

pub fn consume_bytes(bytes: &[u8]) -> Vec<u8> {
    return bytes.to_vec();
}

pub fn make_packet(bytes: Vec<u8>, ordinary: Vec<u8>) -> Packet {
    return Packet { bytes, ordinary };
}

pub fn ordinary_bytes() -> Vec<u8> {
    return Vec::new();
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `export interface Packet {
  bytes: Uint8Array;
  ordinary: number[];
}

export function consumeBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

export function makePacket(bytes: number[], ordinary: number[]): Packet {
  return { bytes: new Uint8Array(bytes), ordinary };
}

export function ordinaryBytes(): number[] {
  return [];
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'contract.ts'),
      "export { consumeBytes, makePacket, ordinaryBytes } from './value.ts';\nexport type { Packet } from './value.ts';\n",
    );
    writeFileSync(
      join(packageRoot, 'src', 'index.ts'),
      "export { consumeBytes, makePacket, ordinaryBytes } from './contract.ts';\nexport type { Packet } from './contract.ts';\n",
    );

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain('bytes: Uint8Array;');
    expect(value).toContain('ordinary: number[];');
    expect(value).toContain('function consumeBytes(bytes: Uint8Array): Uint8Array');
    expect(value).toContain('return new Uint8Array([...bytes]);');
    expect(value).toContain('bytes: new Uint8Array(bytes)');
    expect(value).toContain('function ordinaryBytes(): number[]');
  }, 120_000);

  it('refuses an established fixed-buffer representation for a Rust Vec parameter', async () => {
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), 'pub mod contract;\nmod value;\npub use contract::*;\n');
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::value::*;\n');
    writeFileSync(
      sourcePath,
      `pub fn consume_values(values: Vec<f32>) -> f32 {
    return values[0];
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `export function consumeValues(values: Float32Array): number {
  return values[0];
}
`,
    );
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), "export { consumeValues } from './value.ts';\n");
    writeFileSync(join(packageRoot, 'src', 'index.ts'), "export { consumeValues } from './contract.ts';\n");

    const run = await generateWhileScanning();

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('must designate an exact Rust `&mut [f32]` parameter');
    writeFileSync(
      join(crateRoot, 'src', 'lib.rs'),
      '//! flight-compiler: target-native\npub mod contract;\nmod native_target;\nmod types;\nmod value;\n',
    );
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), 'pub use super::types::*;\npub use super::value::*;\n');
  }, 120_000);

  it('preserves inline string-union representations from existing function signatures', async () => {
    writeFileSync(
      join(crateRoot, 'src', 'types.rs'),
      `//! flight-compiler: rust-only
pub struct AccessibilityOperationOutcome<R> {
    pub blocked: bool,
    pub reason: Option<R>,
}

pub enum AccessibilityTreeBlockReason {
    Destroyed,
    NoDom,
}

pub enum AccessibilityRemoveNodeBlockReason {
    Destroyed,
    NoDom,
    NodeNotFound,
}
`,
    );
    writeFileSync(
      sourcePath,
      `use crate::types::{
    AccessibilityOperationOutcome,
    AccessibilityRemoveNodeBlockReason,
    AccessibilityTreeBlockReason,
};

pub fn clear_accessibility_tree(
    outcome: AccessibilityOperationOutcome<AccessibilityTreeBlockReason>,
) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
    return outcome;
}

pub fn remove_accessibility_node(
    outcome: AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason>,
) -> AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason> {
    return outcome;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `import type { AccessibilityOperationOutcome } from '@flighthq/types/contract';

export function clearAccessibilityTree(
  outcome: AccessibilityOperationOutcome<'destroyed' | 'no-dom'>,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  return outcome;
}

export function removeAccessibilityNode(
  outcome: AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'>,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'> {
  return outcome;
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'contract.ts'),
      "export { clearAccessibilityTree, removeAccessibilityNode } from './value.ts';\n",
    );
    writeFileSync(
      join(packageRoot, 'src', 'index.ts'),
      "export { clearAccessibilityTree, removeAccessibilityNode } from './contract.ts';\n",
    );

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain("AccessibilityOperationOutcome<'destroyed' | 'no-dom'>");
    expect(value).toContain("AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'>");
    expect(value).not.toContain('AccessibilityTreeBlockReason');
    expect(value).not.toContain('AccessibilityRemoveNodeBlockReason');
  }, 120_000);

  it('generates explicit empty modules for an intentionally empty public contract', async () => {
    rmSync(join(crateRoot, 'tests', 'strict_test.rs'), { force: true });
    rmSync(sourcePath, { force: true });
    rmSync(join(crateRoot, 'src', 'compatibility.rs'), { force: true });
    rmSync(join(crateRoot, 'src', 'types.rs'), { force: true });
    writeFileSync(join(crateRoot, 'src', 'lib.rs'), 'pub mod contract;\n');
    writeFileSync(join(crateRoot, 'src', 'contract.rs'), '');
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), 'export {};\n');
    writeFileSync(join(packageRoot, 'src', 'index.ts'), 'export {};\n');

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    expect(run.stderr).not.toContain('has no public root exports');
    expect(readFileSync(join(packageRoot, 'src', 'contract.ts'), 'utf8')).toContain('export {};');
    expect(readFileSync(join(packageRoot, 'src', 'index.ts'), 'utf8')).toContain('export {};');
  }, 120_000);

  it('preserves target-native package roots and modules without resolving native root exports', async () => {
    rmSync(join(crateRoot, 'tests', 'strict_test.rs'), { force: true });
    const nativeValue = 'export function nativeValue(): number { return 7; }\n';
    const nativeContract = "export { nativeValue } from './value.ts';\n";
    const nativeIndex = "export { nativeValue } from './contract.ts';\n";
    writeFileSync(
      join(crateRoot, 'src', 'lib.rs'),
      '//! flight-compiler: target-native\nmod other;\nmod value;\npub mod contract;\npub use contract::*;\n',
    );
    rmSync(join(crateRoot, 'src', 'contract.rs'));
    writeFileSync(sourcePath, '//! flight-compiler: target-native\npub fn native_value() -> i32 { 7 }\n');
    writeFileSync(
      join(crateRoot, 'src', 'other.rs'),
      '//! flight-compiler: target-native\npub fn native_value() -> i32 { 8 }\n',
    );
    writeFileSync(join(packageRoot, 'src', 'value.ts'), nativeValue);
    writeFileSync(join(packageRoot, 'src', 'other.ts'), nativeValue);
    writeFileSync(join(packageRoot, 'src', 'contract.ts'), nativeContract);
    writeFileSync(join(packageRoot, 'src', 'index.ts'), nativeIndex);

    const run = await generateWhileScanning();

    expect(run.code, run.stderr).toBe(0);
    expect(run.stderr).not.toContain('Error');
    expect(readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8')).toBe(nativeValue);
    expect(readFileSync(join(packageRoot, 'src', 'other.ts'), 'utf8')).toBe(nativeValue);
    expect(readFileSync(join(packageRoot, 'src', 'contract.ts'), 'utf8')).toBe(nativeContract);
    expect(readFileSync(join(packageRoot, 'src', 'index.ts'), 'utf8')).toBe(nativeIndex);
  }, 120_000);
});
