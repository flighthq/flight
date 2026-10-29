import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for opaque `dyn Any` trait objects, run through the real `flight-compile` CLI: a trait object
// whose only non-auto bound resolves to `std::any::Any` lowers to `object` (the opaque `ProviderRef` and
// input-source handle), handle identity lowers to `===`, a payload without identity fails strict
// TypeScript, and a local `Any` fails closed.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const SOURCE_FIXTURE = `use std::any::Any;
use std::sync::Arc;

pub type ProviderRef = Arc<dyn Any + Send + Sync>;

pub struct Source {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

pub fn same_source(a: &Source, b: &Source) -> bool {
    return Arc::ptr_eq(&a.handle, &b.handle);
}
`;

const UNIT_FIXTURE = `use std::any::Any;
use std::sync::Arc;

pub fn fresh() -> Arc<dyn Any + Send + Sync> {
    return Arc::new(());
}
`;

const LOCAL_ANY_FIXTURE = `use std::sync::Arc;
trait Any {}
pub type Local = Arc<dyn Any>;
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-opaque-any-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(name: string, rust: string): { error: string; typescript: string } {
  const source = join(workDirectory, `${name}.rs`);
  const out = join(workDirectory, `${name}.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
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

describe('flight-compile opaque Any trait objects', () => {
  it('lowers std Any objects to object under strict TypeScript', () => {
    const { error, typescript } = compileRust('source', SOURCE_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('export type ProviderRef = object;');
    expect(typescript).toContain('handle: object;');
    expect(
      strictDiagnostics(`${typescript}export const source: Source = { provider: {}, handle: new Map() };\n`),
    ).toEqual([]);
  });

  it('compares handles by identity when executed', () => {
    const sameSource = loadModule(compileRust('source', SOURCE_FIXTURE).typescript).sameSource as unknown as (
      a: { provider: object; handle: object },
      b: { provider: object; handle: object },
    ) => boolean;
    const handle = {};
    expect(sameSource({ provider: {}, handle }, { provider: {}, handle })).toBe(true);
    expect(sameSource({ provider: handle, handle }, { provider: handle, handle: {} })).toBe(false);
  });

  it('rejects a unit payload, which has no identity, under strict TypeScript', () => {
    const { error, typescript } = compileRust('unit', UNIT_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual(["Type 'undefined' is not assignable to type 'object'."]);
  });

  it('fails closed on a local Any trait', () => {
    expect(compileRust('local', LOCAL_ANY_FIXTURE).error).toBe(
      'error: unsupported Rust trait object; only callable traits are portable',
    );
  });
});
