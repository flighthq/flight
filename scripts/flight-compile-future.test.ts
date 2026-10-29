import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for the compiler's type-position lowering of `Pin<Box<dyn Future<Output = T> + Send>>`
// to `Promise<T>`, run through the real `flight-compile` CLI: the emitted capability types typecheck under
// `strict`, accept a Promise-returning implementation, reject a synchronous one, and resolve when run.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const CAPABILITY_FIXTURE = `use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub struct Outcome {
    pub ok: bool,
}

pub type Exit = Pin<Box<dyn Future<Output = Outcome> + Send>>;

pub struct Capability {
    pub exit: Arc<dyn Fn() -> Exit + Send + Sync>,
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-future-'));
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

function strictDiagnostics(name: string, typescript: string): string[] {
  const fileName = join(workDirectory, `${name}.check.ts`);
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

describe('flight-compile pinned future lowering', () => {
  it('emits Promise types that typecheck under strict TypeScript', () => {
    const { error, typescript } = compileRust('capability', CAPABILITY_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('export type Exit = Promise<Outcome>;');
    expect(strictDiagnostics('capability', typescript)).toEqual([]);
  });

  it('accepts an asynchronous implementation and rejects a synchronous one', () => {
    const { typescript } = compileRust('capability', CAPABILITY_FIXTURE);
    const accepted = `${typescript}\nexport const capability: Capability = { exit: async () => ({ ok: true }) };\nexport const pending: Promise<Outcome> = capability.exit();\n`;
    expect(strictDiagnostics('accepted', accepted)).toEqual([]);
    const rejected = `${typescript}\nexport const capability: Capability = { exit: () => ({ ok: true }) };\n`;
    expect(strictDiagnostics('rejected', rejected).length).toBeGreaterThan(0);
  });

  it('resolves the asynchronous outcome when executed', async () => {
    const { typescript } = compileRust('capability', CAPABILITY_FIXTURE);
    const source = `${typescript}\nexport const capability: Capability = { exit: async () => ({ ok: true }) };\n`;
    const javascript = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} as { capability: { exit: () => Promise<{ ok: boolean }> } } };
    new Function('exports', 'module', javascript)(module.exports, module);
    await expect(module.exports.capability.exit()).resolves.toEqual({ ok: true });
  });

  it('fails closed for async bodies, await, and other Pin shapes', () => {
    for (const [rust, expected] of [
      ['pub async fn f() -> u32 { return 1; }\n', 'error: portable `async fn f` has no portable lowering'],
      [
        'pub fn f(x: u32) -> u32 { let y = x.await; return y; }\n',
        'error: unsupported Rust expression `await expression`',
      ],
      [
        'use std::pin::Pin;\npub type P = Pin<Box<u32>>;\n',
        'error: portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` in a type position',
      ],
    ] as const) {
      expect(compileRust('rejected', rust).error).toBe(expected);
    }
  });
});
