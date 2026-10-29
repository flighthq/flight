import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Exercises nullable Option return provenance through the real source and Vitest generators. A local
// initialized by a nullable-return call must keep `null` as its absent value even when its name gives
// no hint about representation.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const CONTRACT_FIXTURE = `//! flight-compiler: nullable-option find_value

pub fn find_value(present: bool) -> Option<i32> {
    if present {
        return Some(7);
    }
    return None;
}

pub fn find_optional() -> Option<i32> {
    return None;
}
`;

const TEST_FIXTURE = `use flight_example::*;

#[test]
fn checks_bound_nullable_returns() {
    let result = find_value(false);
    assert!(result.is_none());
    if true {
        let result = find_optional();
        assert!(result.is_none());
    }
    let answer = find_value(true);
    assert!(answer.is_some());
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-nullable-vitest-binding-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function generateFixture(): { contract: string; tests: string } {
  const contractSource = join(workDirectory, 'contract.rs');
  const contractOut = join(workDirectory, 'contract.ts');
  const testSource = join(workDirectory, 'nullable_test.rs');
  const testOut = join(workDirectory, 'nullable.test.ts');
  writeFileSync(contractSource, CONTRACT_FIXTURE);
  writeFileSync(testSource, TEST_FIXTURE);
  const contractResult = spawnSync(compilerPath, ['generate', '--source', contractSource, '--out', contractOut], {
    encoding: 'utf8',
  });
  expect(contractResult.stderr.trim()).toBe('');
  const testResult = spawnSync(
    compilerPath,
    [
      'generate-tests',
      '--source',
      testSource,
      '--out',
      testOut,
      '--contract-module',
      '@flighthq/example/contract',
      '--alias-source',
      contractSource,
    ],
    { encoding: 'utf8' },
  );
  expect(testResult.stderr.trim()).toBe('');
  return { contract: readFileSync(contractOut, 'utf8'), tests: readFileSync(testOut, 'utf8') };
}

function vitestStub(): string {
  return [
    'export function describe(name: string, body: () => void): void { body(); }',
    'export function it(name: string, body: () => void): void { body(); }',
    'export function expect(actual: unknown): { toBe(expected: unknown): void; toEqual(expected: unknown): void } {',
    '  const check = (expected: unknown): void => { if (actual !== expected) throw new Error(`${String(actual)} !== ${String(expected)}`); };',
    '  return { toBe: check, toEqual: check };',
    '}',
    '',
  ].join('\n');
}

describe('flight-compile nullable Vitest binding provenance', () => {
  it('typechecks the generated contract and Vitest under strict TypeScript', () => {
    const generated = generateFixture();
    const contractFile = join(workDirectory, 'contract.ts');
    const testFile = join(workDirectory, 'nullable.test.ts');
    const vitestFile = join(workDirectory, 'vitest-stub.ts');
    writeFileSync(contractFile, generated.contract);
    writeFileSync(testFile, generated.tests);
    writeFileSync(vitestFile, vitestStub());
    const program = ts.createProgram([contractFile, testFile], {
      baseUrl: workDirectory,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { '@flighthq/example/contract': [contractFile], vitest: [vitestFile] },
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);
    expect(generated.tests).toContain('expect(result === null).toBe(true);');
    expect(generated.tests).toContain('expect(result === undefined).toBe(true);');
    expect(generated.tests).toContain('expect(answer !== null).toBe(true);');
  });

  it('executes both nullable local assertions', () => {
    const generated = generateFixture();
    const modules = new Map<string, Record<string, unknown>>();
    const load = (typescript: string, specifier: string): void => {
      const javascript = ts.transpileModule(typescript, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const module = { exports: {} as Record<string, unknown> };
      new Function('exports', 'module', 'require', javascript)(module.exports, module, (name: string) =>
        modules.get(name),
      );
      modules.set(specifier, module.exports);
    };
    load(generated.contract, '@flighthq/example/contract');
    load(vitestStub(), 'vitest');
    expect(() => load(generated.tests, 'nullable-tests')).not.toThrow();
  });
});
