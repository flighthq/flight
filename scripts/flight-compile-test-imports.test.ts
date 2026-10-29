import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for test generation through the real `flight-compile generate-tests` CLI: a foreign item a
// test uses only inside `assert!` / `assert_eq!` is imported from its owning package's contract, not
// from the package under test.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const ASSERTION_FIXTURE = `use flight_entity::has_entity_runtime;

mod foreign_assertions {
    use super::*;

    #[test]
    fn reads_foreign_values_inside_assertions() {
        let value = 1;
        assert!(!has_entity_runtime(&value));
        assert_eq!(has_entity_runtime(&value), false);
    }
}
`;

// A foreign function reached only through a `vec![value; length]` repeat in a test, and only through the
// value of a `matches!` whose pattern binds by `ref` in production code.
const VEC_REPEAT_FIXTURE = `use flight_entity::has_entity_runtime;

mod foreign_macro_arguments {
    use super::*;

    #[test]
    fn reads_foreign_values_inside_vec_repeats() {
        let flags = vec![has_entity_runtime(&1); 2];
        assert_eq!(flags.len(), 2);
    }
}
`;

const MATCHES_REF_FIXTURE = `//! flight-compiler: data-union Payload

use flight_codec::decode_payload;

pub enum Payload {
    Count(i32),
    Label(String),
}

pub fn is_label(value: i32) -> bool {
    return matches!(decode_payload(value), Payload::Label(ref text));
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-test-imports-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function generateTests(rust: string): string {
  const source = join(workDirectory, 'assertions_test.rs');
  const out = join(workDirectory, 'assertions.test.ts');
  writeFileSync(source, rust);
  const result = spawnSync(
    compilerPath,
    ['generate-tests', '--source', source, '--out', out, '--contract-module', './contract.ts'],
    {
      encoding: 'utf8',
    },
  );
  expect(result.stderr.trim()).toBe('');
  return readFileSync(out, 'utf8');
}

describe('flight-compile generate-tests foreign imports', () => {
  it('imports a foreign function used only inside a vec! repeat', () => {
    const typescript = generateTests(VEC_REPEAT_FIXTURE);
    expect(typescript).toContain('import { hasEntityRuntime } from "@flighthq/entity/contract";');
    expect(typescript).not.toContain('./contract.ts');
  });

  it('imports a foreign function used only inside a matches! with a ref pattern, and runs', () => {
    const source = join(workDirectory, 'payload.rs');
    const out = join(workDirectory, 'payload.ts');
    writeFileSync(source, MATCHES_REF_FIXTURE);
    const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
    expect(result.stderr.trim()).toBe('');
    const typescript = readFileSync(out, 'utf8');
    expect(typescript).toContain('import { decodePayload } from "@flighthq/codec/contract";');
    const codec = join(workDirectory, 'codec-contract.ts');
    writeFileSync(
      codec,
      "export function decodePayload(value: number): number | string {\n  return value > 0 ? 'label' : value;\n}\n",
    );
    const program = ts.createProgram([out], {
      baseUrl: workDirectory,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { '@flighthq/codec/contract': [codec] },
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);
    const transpile = (path: string): string =>
      ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    const codecModule = { exports: {} as Record<string, unknown> };
    new Function('exports', 'module', transpile(codec))(codecModule.exports, codecModule);
    const payloadModule = { exports: {} as { isLabel: (value: number) => boolean } };
    new Function('exports', 'module', 'require', transpile(out))(
      payloadModule.exports,
      payloadModule,
      () => codecModule.exports,
    );
    expect(payloadModule.exports.isLabel(1)).toBe(true);
    expect(payloadModule.exports.isLabel(-1)).toBe(false);
  });

  it('imports a foreign function used only inside assertions from its owner', () => {
    const typescript = generateTests(ASSERTION_FIXTURE);
    expect(typescript).toContain('import { hasEntityRuntime } from "@flighthq/entity/contract";');
    expect(typescript).not.toContain('./contract.ts');
  });

  it('typechecks against the owner contract and runs', () => {
    const typescript = generateTests(ASSERTION_FIXTURE);
    const entity = join(workDirectory, 'entity-contract.ts');
    writeFileSync(
      entity,
      'export function hasEntityRuntime(value: unknown): boolean {\n  return value === undefined;\n}\n',
    );
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
    const testFile = join(workDirectory, 'assertions.test.ts');
    writeFileSync(testFile, typescript);
    const program = ts.createProgram([testFile], {
      baseUrl: workDirectory,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { '@flighthq/entity/contract': [entity], vitest: [vitest] },
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
    load(entity, '@flighthq/entity/contract');
    load(vitest, 'vitest');
    expect(() => load(testFile, 'assertions')).not.toThrow();
  });
});
