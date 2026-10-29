import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for generic Rust test helpers, run through the real `flight-compile` CLI: a helper's own
// type parameters are emitted on the helper and are never imported from the package contract.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const CONTRACT_FIXTURE = `pub struct Box2<T> {
    pub value: T,
}

pub fn wrap<T>(value: T) -> Box2<T> {
    return Box2 { value };
}
`;

const TEST_FIXTURE = `use crate::*;

fn unwrap_value<T: Clone>(boxed: &Box2<T>) -> T {
    return boxed.value.clone();
}

#[test]
fn wraps_values() {
    assert_eq!(unwrap_value(&wrap(3)), 3);
    assert_eq!(unwrap_value(&wrap("text")), "text");
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-generic-test-helpers-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compile(args: readonly string[]): string {
  const result = spawnSync(compilerPath, args, { encoding: 'utf8' });
  expect(result.stderr.trim()).toBe('');
  return readFileSync(args[args.indexOf('--out') + 1], 'utf8');
}

describe('flight-compile generic test helpers', () => {
  it('declares helper type parameters, typechecks strictly, and runs', () => {
    const contractSource = join(workDirectory, 'lib.rs');
    const contract = join(workDirectory, 'contract.ts');
    const testSource = join(workDirectory, 'lib_test.rs');
    const testFile = join(workDirectory, 'lib.test.ts');
    writeFileSync(contractSource, CONTRACT_FIXTURE);
    writeFileSync(testSource, TEST_FIXTURE);
    compile(['generate', '--source', contractSource, '--out', contract]);
    const typescript = compile([
      'generate-tests',
      '--source',
      testSource,
      '--out',
      testFile,
      '--contract-module',
      './contract.ts',
      '--contract-source',
      contractSource,
    ]);
    expect(typescript).toContain('function unwrapValue<T>(boxed: Readonly<Box2<T>>): T {');
    const vitest = join(workDirectory, 'vitest-stub.ts');
    writeFileSync(
      vitest,
      [
        'export function describe(name: string, body: () => void): void { body(); }',
        'export function it(name: string, body: () => void): void { body(); }',
        'export function expect(actual: unknown): { toBe(expected: unknown): void; toEqual(expected: unknown): void } {',
        '  const check = (expected: unknown): void => { if (actual !== expected) throw new Error(`${String(actual)} !== ${String(expected)}`); };',
        '  return { toBe: check, toEqual: check };',
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
    expect(() => load(testFile, 'lib.test')).not.toThrow();
  });
});
