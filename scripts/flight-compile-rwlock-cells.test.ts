import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for standard `RwLock` cells, run through the real `flight-compile` CLI: a proven
// `Arc<RwLock<T>>` parameter or local (under its own or a renamed import) lowers to the shared payload
// `T`, as `Ref<T>` does, instead of a nonexistent `RwLock<T>` type; an unresolved `RwLock` fails closed.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const CELL_FIXTURE = `use std::sync::Arc;
use std::sync::RwLock as Lock;
use std::sync::RwLock;

pub struct Counter {
    pub count: i32,
}

pub fn bump(state: Arc<RwLock<Counter>>) -> i32 {
    let alias: Arc<RwLock<Counter>> = state.clone();
    alias.write().unwrap().count += 1;
    return state.read().unwrap().count;
}

pub fn read_renamed(state: &Arc<Lock<Counter>>) -> i32 {
    return state.read().unwrap().count;
}
`;

const UNRESOLVED_FIXTURE = `use std::sync::Arc;

pub fn read(value: Arc<RwLock<i32>>) -> i32 {
    return 0;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-rwlock-cells-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(name: string, rust: string): { error: string; out: string } {
  const source = join(workDirectory, `${name}.rs`);
  const out = join(workDirectory, `${name}.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
  return { error: result.stderr.trim(), out };
}

describe('flight-compile RwLock cells', () => {
  it('lowers proven cells to their shared payload under strict TypeScript and shares writes', () => {
    const { error, out } = compileRust('cells', CELL_FIXTURE);
    expect(error).toBe('');
    const typescript = readFileSync(out, 'utf8');
    expect(typescript).not.toContain('RwLock');
    expect(typescript).not.toContain('Lock<');
    const program = ts.createProgram([out], {
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);
    const javascript = ts.transpileModule(typescript, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = {
      exports: {} as {
        bump: (state: { count: number }) => number;
        readRenamed: (state: { count: number }) => number;
      },
    };
    new Function('exports', 'module', javascript)(module.exports, module);
    const counter = { count: 1 };
    expect(module.exports.bump(counter)).toBe(2);
    expect(counter.count).toBe(2);
    expect(module.exports.readRenamed(counter)).toBe(2);
  });

  it('rejects an unresolved RwLock, which may not be the standard cell', () => {
    expect(compileRust('unresolved', UNRESOLVED_FIXTURE).error).toBe(
      'error: cannot resolve the provenance of `RwLock`; import it from `std::sync` to lower it to its shared payload',
    );
  });
});
