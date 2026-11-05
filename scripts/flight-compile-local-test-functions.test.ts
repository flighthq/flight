import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for block-hoisted Rust function items inside portable tests, run through the real
// `flight-compile` CLI. Only proven non-capturing direct-call helpers are allowed to reach JS.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const CONTRACT_FIXTURE = `pub fn increment(value: i32) -> i32 {
    return value + 1;
}
`;

const TEST_FIXTURE = `use crate::*;

#[test]
fn uses_hoisted_helpers() {
    assert_eq!(twice(3), 8);

    fn twice(value: i32) -> i32 {
        return add_one(value) + add_one(value);
    }

    fn add_one(value: i32) -> i32 {
        return increment(value);
    }
}
`;

let workDirectory = '';
let contractSource = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-local-test-functions-'));
  contractSource = join(workDirectory, 'lib.rs');
  writeFileSync(contractSource, CONTRACT_FIXTURE);
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compile(args: readonly string[]): { status: number | null; stderr: string } {
  const result = spawnSync(compilerPath, args, { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

function testArguments(source: string, out: string): string[] {
  return [
    'generate-tests',
    '--source',
    source,
    '--out',
    out,
    '--contract-module',
    './contract.ts',
    '--contract-source',
    contractSource,
  ];
}

describe('flight-compile local test functions', () => {
  it('preserves block hoisting, typechecks strictly, and runs', () => {
    const contract = join(workDirectory, 'contract.ts');
    const testSource = join(workDirectory, 'local_test.rs');
    const testFile = join(workDirectory, 'local.test.ts');
    writeFileSync(testSource, TEST_FIXTURE);

    const contractResult = compile(['generate', '--source', contractSource, '--out', contract]);
    expect(contractResult.stderr.trim()).toBe('');
    const testResult = compile(testArguments(testSource, testFile));
    expect(testResult.stderr.trim()).toBe('');

    const typescript = readFileSync(testFile, 'utf8');
    expect(typescript.indexOf('expect(twice(3)).toEqual(8);')).toBeLessThan(
      typescript.indexOf('function twice(value: number): number {'),
    );
    expect(typescript).toContain('return addOne(value) + addOne(value);');
    expect(typescript).toContain('return increment(value);');

    const vitest = join(workDirectory, 'vitest-stub.ts');
    writeFileSync(
      vitest,
      [
        'export function describe(name: string, body: () => void): void { body(); }',
        'export function it(name: string, body: () => void): void { body(); }',
        'export function expect(actual: unknown): { toEqual(expected: unknown): void } {',
        '  return { toEqual(expected: unknown): void { if (actual !== expected) throw new Error(`${String(actual)} !== ${String(expected)}`); } };',
        '}',
        '',
      ].join('\n'),
    );
    const program = ts.createProgram([testFile], {
      allowImportingTsExtensions: true,
      baseUrl: workDirectory,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { vitest: [vitest] },
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);

    const modules = new Map<string, Record<string, unknown>>();
    const load = (path: string, specifier: string): void => {
      const javascript = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const module = { exports: {} as Record<string, unknown> };
      new Function('exports', 'module', 'require', javascript)(module.exports, module, (name: string) =>
        modules.get(name),
      );
      modules.set(specifier, module.exports);
    };
    load(contract, './contract.ts');
    load(vitest, 'vitest');
    expect(() => load(testFile, 'local.test')).not.toThrow();
  });

  it('refuses captures, recursion, escaping values, and unresolved direct calls', () => {
    for (const [name, rust, expected] of [
      [
        'capture',
        `#[test]
fn sample() {
    let outer = 1;
    fn helper() -> i32 { return outer; }
    assert_eq!(helper(), 1);
}
`,
        'captures outer binding(s) outer',
      ],
      [
        'recursion',
        `#[test]
fn sample() {
    fn helper(value: i32) -> i32 {
        if value == 0 { return 0; }
        return helper(value - 1);
    }
    assert_eq!(helper(1), 0);
}
`,
        'recursive portable nested function cycle',
      ],
      [
        'escape',
        `#[test]
fn sample() {
    fn helper() -> i32 { return 1; }
    let callback = helper;
    assert_eq!(callback(), 1);
}
`,
        'function value(s) helper escape direct call position',
      ],
      [
        'unresolved',
        `#[test]
fn sample() {
    fn helper() -> i32 { return crate::missing(); }
    assert_eq!(helper(), 1);
}
`,
        'calls unresolved function `crate::missing`',
      ],
    ] as const) {
      const source = join(workDirectory, `${name}.rs`);
      const out = join(workDirectory, `${name}.test.ts`);
      writeFileSync(source, rust);
      const result = compile(testArguments(source, out));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(expected);
    }
  });
});
