import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the mutable-scalar reference proof through the real CLI, strict TypeScript, and JavaScript.
// The accepted source must share one cell across repeated calls; refusal fixtures exercise the same
// command boundary rather than only the compiler library API.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const TEST_FIXTURE = `#[test]
fn advances_one_seed_cell() {
    let mut seed = 1u32;

    fn next(seed: &mut u32) -> u32 {
        *seed = seed.wrapping_mul(3).wrapping_add(1);
        return *seed;
    }

    assert_eq!(next(&mut seed), 4);
    assert_eq!(seed, 4);
    assert_eq!(next(&mut seed), 13);
    assert_eq!(seed, 13);
}
`;

let workDirectory = '';
let contractSource = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-mutable-scalar-reference-'));
  contractSource = join(workDirectory, 'lib.rs');
  writeFileSync(contractSource, '');
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compile(args: readonly string[]): ReturnType<typeof spawnSync> {
  return spawnSync(compilerPath, args, { encoding: 'utf8' });
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

describe('flight-compile mutable scalar references', () => {
  it('typechecks and preserves one shared cell at runtime', () => {
    const source = join(workDirectory, 'cell.rs');
    const out = join(workDirectory, 'cell.test.ts');
    writeFileSync(source, TEST_FIXTURE);

    const result = compile(testArguments(source, out));
    expect(String(result.stderr).trim()).toBe('');
    expect(result.status).toBe(0);

    const typescript = readFileSync(out, 'utf8');
    expect(typescript).toContain('const seed: { value: number } = { value: 1 };');
    expect(typescript).toContain('function next(seed: { value: number }): number {');
    expect(typescript).toContain('expect(next(seed)).toEqual(13);');
    expect(typescript).toContain('expect(seed.value).toEqual(13);');

    const vitest = join(workDirectory, 'vitest-stub.ts');
    writeFileSync(
      vitest,
      [
        'export function describe(_name: string, body: () => void): void { body(); }',
        'export function it(_name: string, body: () => void): void { body(); }',
        'export function expect(actual: unknown): { toEqual(expected: unknown): void } {',
        '  return { toEqual(expected: unknown): void { if (actual !== expected) throw new Error(`${String(actual)} !== ${String(expected)}`); } };',
        '}',
        '',
      ].join('\n'),
    );
    const program = ts.createProgram([out], {
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
    load(vitest, 'vitest');
    expect(() => load(out, 'cell.test')).not.toThrow();
  });

  it('refuses an escaping alias at the CLI boundary', () => {
    const source = join(workDirectory, 'escape.rs');
    const out = join(workDirectory, 'escape.test.ts');
    writeFileSync(
      source,
      `#[test]
fn sample() {
    let mut seed = 1u32;
    fn next(seed: &mut u32) { *seed += 1; }
    let alias = &mut seed;
    next(alias);
}
`,
    );

    const result = compile(testArguments(source, out));
    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toContain('requires a direct `&mut local` argument');
  });

  it('refuses the cell representation in a production generation', () => {
    const source = join(workDirectory, 'production.rs');
    const out = join(workDirectory, 'production.ts');
    writeFileSync(
      source,
      `fn next(seed: &mut u32) { *seed += 1; }
pub fn run() -> u32 {
    let mut seed = 1u32;
    next(&mut seed);
    return seed;
}
`,
    );

    const result = compile(['generate', '--source', source, '--out', out]);
    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toContain('supported only for a proven non-escaping local in a portable test');
  });
});
