import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for explicit TypeScript names on Rust constants, run through the real `flight-compile`
// CLI: `export-name` names a scalar and `const-member` places a constant in a PascalCase const object
// under an explicit member name. Generated production matches an established handwritten module, and a
// generated test that reads the crate's contract by Rust name runs against that handwritten module.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const LAYOUT_DIRECTIVES = `//! flight-compiler: export-name ABI_VERSION AbiVersion
//! flight-compiler: export-name ABI_BODY_VALUE_STRIDE AbiBodyValueStride
//! flight-compiler: const-member ABI_COMMAND_KIND_SET_GRAVITY AbiCommandKind.SetGravity
//! flight-compiler: const-member ABI_COMMAND_KIND_WAKE_BODY AbiCommandKind.WakeBody
//! flight-compiler: const-member ABI_BODY_VALUE_INERTIA_XX AbiBodyValue.InertiaXX
//! flight-compiler: const-member ABI_BODY_VALUE_INERTIA_XY AbiBodyValue.InertiaXY
//! flight-compiler: const-member ABI_CAPABILITY_CONTACT_HOOKS AbiCapability.ContactHooks
//! flight-compiler: const-member ABI_CAPABILITY_QUERIES AbiCapability.Queries
`;

const LAYOUT_ITEMS = `
pub const ABI_VERSION: u32 = 1;
pub const ABI_BODY_VALUE_STRIDE: usize = 17;
pub const ABI_COMMAND_KIND_SET_GRAVITY: u32 = 1;
pub const ABI_COMMAND_KIND_WAKE_BODY: u32 = 14;
pub const ABI_BODY_VALUE_INERTIA_XX: usize = 3;
pub const ABI_BODY_VALUE_INERTIA_XY: usize = 4;
pub const ABI_CAPABILITY_CONTACT_HOOKS: u32 = 1 << 0;
pub const ABI_CAPABILITY_QUERIES: u32 = 1 << 2;

pub fn has_capability(capabilities: u32, capability: u32) -> bool {
    return capabilities & capability != 0;
}
`;

// The established TypeScript the Rust names must reach: PascalCase scalars and `as const` objects whose
// member names a mechanical case conversion would get wrong (`InertiaXX`, not `InertiaXx`).
const HANDWRITTEN_LAYOUT = `export const AbiVersion = 1;
export const AbiBodyValueStride = 17;

export const AbiCommandKind = {
  SetGravity: 1,
  WakeBody: 14,
} as const;

export const AbiBodyValue = {
  InertiaXX: 3,
  InertiaXY: 4,
} as const;

export const AbiCapability = {
  ContactHooks: 1 << 0,
  Queries: 1 << 2,
} as const;

export function hasCapability(capabilities: number, capability: number): boolean {
  return (capabilities & capability) !== 0;
}
`;

const TEST_FIXTURE = `use flight_example::contract::*;

mod has_capability {
    use super::*;

    #[test]
    fn reads_layout_constants_by_their_typescript_names() {
        let capabilities = ABI_CAPABILITY_CONTACT_HOOKS | ABI_CAPABILITY_QUERIES;
        assert!(has_capability(capabilities, ABI_CAPABILITY_QUERIES));
        assert_eq!(ABI_VERSION, 1);
        assert_eq!(ABI_COMMAND_KIND_WAKE_BODY, 14);
        assert_ne!(ABI_COMMAND_KIND_SET_GRAVITY, ABI_COMMAND_KIND_WAKE_BODY);
        assert_eq!(ABI_BODY_VALUE_INERTIA_XY - ABI_BODY_VALUE_INERTIA_XX, 1);
        assert!(ABI_BODY_VALUE_INERTIA_XY < ABI_BODY_VALUE_STRIDE);
    }
}
`;

// The temporary directory resolves no packages, so the strict check declares the Vitest surface the
// generated test uses.
const VITEST_DECLARATIONS = `declare module 'vitest' {
  export function describe(name: string, body: () => void): void;
  export function expect(value: unknown): {
    not: { toEqual(expected: unknown): void };
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
  };
  export function it(name: string, body: () => void): void;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-const-member-'));
  writeFileSync(join(workDirectory, 'layout.rs'), LAYOUT_DIRECTIVES + LAYOUT_ITEMS);
  writeFileSync(
    join(workDirectory, 'native_layout.rs'),
    `//! flight-compiler: target-native\n${LAYOUT_DIRECTIVES}${LAYOUT_ITEMS}`,
  );
  writeFileSync(join(workDirectory, 'handwritten.ts'), HANDWRITTEN_LAYOUT);
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compile(arguments_: string[]): string {
  const result = spawnSync(compilerPath, arguments_, { encoding: 'utf8' });
  return result.stderr.trim();
}

function compileTests(rust: string, aliasSource: string): { error: string; typescript: string } {
  const source = join(workDirectory, 'layout_test.rs');
  const out = join(workDirectory, 'layout.test.ts');
  writeFileSync(source, rust);
  const error = compile([
    'generate-tests',
    '--source',
    source,
    '--out',
    out,
    '--contract-module',
    './handwritten.ts',
    '--alias-source',
    join(workDirectory, aliasSource),
  ]);
  return { error, typescript: error === '' ? readFileSync(out, 'utf8') : '' };
}

function transpile(typescript: string): string {
  return ts.transpileModule(typescript, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadModule(typescript: string, load: (specifier: string) => unknown = () => ({})): Record<string, unknown> {
  const module = { exports: {} as Record<string, unknown> };
  new Function('require', 'exports', 'module', transpile(typescript))(load, module.exports, module);
  return module.exports;
}

function strictDiagnostics(files: Record<string, string>): string[] {
  const options: ts.CompilerOptions = {
    allowImportingTsExtensions: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const virtual = new Map(Object.entries(files).map(([name, text]) => [join(workDirectory, name), text]));
  host.readFile = (fileName) => virtual.get(fileName) ?? readFile(fileName);
  host.fileExists = (fileName) => virtual.has(fileName) || fileExists(fileName);
  const program = ts.createProgram([...virtual.keys()], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file !== undefined && virtual.has(diagnostic.file.fileName))
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

describe('flight-compile const-member', () => {
  it('generates the established names and values of the handwritten module', () => {
    const out = join(workDirectory, 'layout.ts');
    expect(compile(['generate', '--source', join(workDirectory, 'layout.rs'), '--out', out])).toBe('');
    const generated = readFileSync(out, 'utf8');
    expect(generated).toContain('export const AbiBodyValue = {\n  InertiaXX: 3,\n  InertiaXY: 4,\n};');
    expect(generated).toContain('export const AbiCapability = {\n  ContactHooks: 1 << 0,\n  Queries: 1 << 2,\n};');
    const sorted = (exports: Record<string, unknown>): string =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(exports)
            .filter(([, value]) => typeof value !== 'function')
            .sort(),
        ),
      );
    expect(sorted(loadModule(generated))).toBe(sorted(loadModule(HANDWRITTEN_LAYOUT)));
  });

  it('lowers a test of a target-native layout to the handwritten names, typechecks strictly, and runs', () => {
    const { error, typescript } = compileTests(TEST_FIXTURE, 'native_layout.rs');
    expect(error).toBe('');
    expect(typescript).toContain('const capabilities = AbiCapability.ContactHooks | AbiCapability.Queries;');
    expect(typescript).toContain('expect(AbiBodyValue.InertiaXY - AbiBodyValue.InertiaXX).toEqual(1);');
    expect(typescript).toContain('expect(AbiBodyValue.InertiaXY < AbiBodyValueStride).toBe(true);');
    expect(typescript).not.toMatch(/\bABI_/);
    expect(
      strictDiagnostics({
        'handwritten.ts': HANDWRITTEN_LAYOUT,
        'layout.test.ts': typescript,
        'vitest.d.ts': VITEST_DECLARATIONS,
      }),
    ).toEqual([]);
    const handwritten = loadModule(HANDWRITTEN_LAYOUT);
    const vitest = {
      describe: (_: string, body: () => void) => body(),
      expect,
      it: (_: string, body: () => void) => body(),
    };
    expect(() => loadModule(typescript, (specifier) => (specifier === 'vitest' ? vitest : handwritten))).not.toThrow();
  });

  it('refuses a test binding that would be renamed with a mapped contract item', () => {
    const shadowing = `use flight_example::contract::*;

#[test]
fn reads_a_local() {
    let ABI_VERSION = 2;
    assert_eq!(ABI_VERSION, 2);
}
`;
    expect(compileTests(shadowing, 'native_layout.rs').error).toBe(
      'error: test declares `ABI_VERSION`, which the crate names `AbiVersion` in TypeScript; rename the test binding',
    );
  });
});
