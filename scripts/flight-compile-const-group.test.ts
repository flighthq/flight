import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for the compiler's `const-group` directive, run through the real `flight-compile` CLI:
// a prefixed group of public Rust constants becomes one exported TypeScript const object that typechecks
// under `strict`, keeps each literal's value, and is referenced as `Owner.Member`; importing a member
// across packages fails closed.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const KEY_FIXTURE = `//! The table.
//! flight-compiler: const-group KeyCode KEY_CODE_

/// \`KeyCode.A\`.
pub const KEY_CODE_A: i32 = 0x61;

/// B.
pub const KEY_CODE_B: i32 = 0x62;

pub const OTHER: f32 = 1.5;

pub const KEY_CODE_NUMBER_0: i32 = 0x30;

pub type KeyCode = i32;

pub fn is_a(code: KeyCode) -> bool { return code == KEY_CODE_A || code == KEY_CODE_NUMBER_0; }
`;

const KEYS_PACKAGE_FIXTURE = `//! flight-compiler: const-group KeyCode KEY_CODE_
pub const KEY_CODE_A: i32 = 0x61;
pub type KeyCode = i32;
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-const-group-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(name: string, rust: string, extra: readonly string[] = []): { error: string; typescript: string } {
  const source = join(workDirectory, `${name}.rs`);
  const out = join(workDirectory, `${name}.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out, ...extra], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return { error: result.stderr.trim(), typescript: '' };
  return { error: '', typescript: readFileSync(out, 'utf8') };
}

function strictDiagnostics(typescript: string): string[] {
  const fileName = join(workDirectory, 'strict-check.ts');
  writeFileSync(fileName, typescript);
  const program = ts.createProgram([fileName], {
    lib: ['lib.es2022.d.ts'],
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

function loadModule(typescript: string): Record<string, (...args: never[]) => unknown> {
  const javascript = ts.transpileModule(typescript, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, (...args: never[]) => unknown> };
  new Function('exports', 'module', javascript)(module.exports, module);
  return module.exports;
}

describe('flight-compile const-group lowering', () => {
  it('emits one exported const object that typechecks under strict TypeScript', () => {
    const { error, typescript } = compileRust('keys', KEY_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('export const KeyCode = {');
    expect(typescript).not.toContain('KEY_CODE_');
    const usage = `${typescript}export const code: KeyCode = KeyCode.B;\nexport const missing = KeyCode.C;\n`;
    expect(strictDiagnostics(`${typescript}export const code: KeyCode = KeyCode.B;\n`)).toEqual([]);
    expect(strictDiagnostics(usage).length).toBeGreaterThan(0);
  });

  it('keeps member values, order, and Owner.Member references when executed', () => {
    const exports = loadModule(compileRust('keys', KEY_FIXTURE).typescript) as unknown as {
      KeyCode: Record<string, number>;
      OTHER: number;
      isA: (code: number) => boolean;
    };
    expect(Object.entries(exports.KeyCode)).toEqual([
      ['A', 0x61],
      ['B', 0x62],
      ['NUMBER_0', 0x30],
    ]);
    expect(exports.OTHER).toBe(1.5);
    expect(exports.isA(0x61)).toBe(true);
    expect(exports.isA(0x30)).toBe(true);
    expect(exports.isA(0x62)).toBe(false);
  });

  it('fails closed when a package imports a member by its Rust name', () => {
    const keys = join(workDirectory, 'keys_package.rs');
    writeFileSync(keys, KEYS_PACKAGE_FIXTURE);
    const dependency = ['--external-alias-source', keys, '--external-alias-module', '@flighthq/keys/contract'];
    for (const [rust, message] of [
      [
        'use flight_keys::KEY_CODE_A;\npub fn is_a(code: i32) -> bool {\n    return code == KEY_CODE_A;\n}\n',
        'error: importing `const-group` member `KEY_CODE_A` from `@flighthq/keys/contract` has no portable lowering; it is `KeyCode.A` in TypeScript',
      ],
      [
        'use flight_keys::*;\npub fn is_a(code: i32) -> bool {\n    return code == KEY_CODE_A;\n}\n',
        'error: a wildcard import of `@flighthq/keys/contract` would bring in `const-group` member `KEY_CODE_A` (`KeyCode.A` in TypeScript), which has no portable lowering',
      ],
    ] as const) {
      expect(compileRust('consumer', rust, dependency).error).toBe(message);
    }
  });
});
