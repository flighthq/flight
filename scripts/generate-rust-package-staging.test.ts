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
function generateWhileScanning(lenient = false): Promise<GenerationRun> {
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
      ...(lenient ? ['--lenient'] : []),
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
      `//! flight-compiler: root-only goodValue

pub fn good_value(value: i32) -> i32 {
    return value + 1;
}

pub fn unsupported_value(value: &dyn std::any::Any) -> bool {
    return value.type_id() == std::any::TypeId::of::<u32>();
}
`,
    );
    writeFileSync(
      join(packageRoot, 'src', 'value.ts'),
      `export function goodValue(value: number): number { return value + 1; }
export function unsupportedValue(_value: unknown): boolean { return true; }
`,
    );

    const run = await generateWhileScanning(true);

    expect(run.code).toBe(0);
    expect(run.stderr).toContain('lenient: 1 items skipped');
    const value = readFileSync(join(packageRoot, 'src', 'value.ts'), 'utf8');
    expect(value).toContain("export { goodValue } from './value.generated.ts';");
    expect(value).toContain("export { unsupportedValue } from './value.native.ts';");
    expect(readFileSync(join(packageRoot, 'src', 'value.generated.ts'), 'utf8')).toContain('export function goodValue');
    expect(readFileSync(join(packageRoot, 'src', 'value.native.ts'), 'utf8')).toContain(
      'export function unsupportedValue',
    );
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
      '//! flight-compiler: target-native\npub mod contract;\nmod native_target;\nmod types;\nmod value;\n',
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

pub fn mark_label(label: Option<&str>) -> bool {
    return label.is_none();
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

export function markLabel(label?: string): boolean {
  return label === undefined;
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
    expect(value).toContain('function markLabel(label?: string): boolean');
    expect(value).toContain('label === undefined');
    expect(value).not.toContain('AnimationPlayerRef');
    expect(value).not.toContain('TargetRef');
    const test = readFileSync(join(packageRoot, 'src', 'alias.test.ts'), 'utf8');
    expect(test).toContain('function consumeTarget(target: unknown): void');
    expect(test).not.toContain('TargetRef');
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
