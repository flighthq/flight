import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for `if let Some(name) = value` and `while let Some(name) = value`, run through the real
// `flight-compile` CLI: a scrutinee that is not a plain binding or field is evaluated once per test, a
// binding named like its scrutinee narrows without redeclaring itself, and an `else` branch still sees
// the outer binding the pattern shadows.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const COUNTER_FIXTURE = `pub struct Counter {
    pub calls: i32,
    pub remaining: i32,
    pub last: Option<i32>,
}

pub fn create_counter() -> Counter {
    return Counter {
        calls: 0,
        remaining: 0,
        last: None,
    };
}

fn take_next(counter: &mut Counter) -> Option<i32> {
    counter.calls += 1;
    if counter.remaining == 0 {
        return None;
    }
    counter.remaining -= 1;
    return Some(counter.remaining);
}

pub fn take_once(counter: &mut Counter) -> i32 {
    if let Some(value) = take_next(counter) {
        return value;
    }
    return -1;
}

pub fn drain(counter: &mut Counter) -> i32 {
    let mut total = 0;
    while let Some(value) = take_next(counter) {
        total += value;
    }
    return total;
}

pub fn call_if_present(callback: Option<fn(i32) -> i32>, value: i32) -> i32 {
    if let Some(callback) = callback {
        return callback(value);
    }
    return value;
}

pub fn last_or(counter: &Counter, value: i32) -> i32 {
    if let Some(value) = counter.last {
        return value;
    } else {
        return value;
    }
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-option-binding-'));
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

type Counter = { calls: number; remaining: number; last?: number };

describe('flight-compile Option if let and while let', () => {
  it('typechecks under strict TypeScript', () => {
    const { error, typescript } = compileRust('counter', COUNTER_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
  });

  it('evaluates a call scrutinee once per test', () => {
    const exports = loadModule(compileRust('counter', COUNTER_FIXTURE).typescript);
    const create = exports.createCounter as unknown as () => Counter;
    const takeOnce = exports.takeOnce as unknown as (counter: Counter) => number;
    const drain = exports.drain as unknown as (counter: Counter) => number;
    const once = create();
    once.remaining = 2;
    expect(takeOnce(once)).toBe(1);
    expect(once.calls).toBe(1);
    expect(once.remaining).toBe(1);
    const empty = create();
    expect(takeOnce(empty)).toBe(-1);
    expect(empty.calls).toBe(1);
    const looped = create();
    looped.remaining = 3;
    expect(drain(looped)).toBe(2 + 1 + 0);
    expect(looped.calls).toBe(4);
  });

  it('narrows a binding named like its scrutinee and keeps the outer binding in else', () => {
    const exports = loadModule(compileRust('counter', COUNTER_FIXTURE).typescript);
    const callIfPresent = exports.callIfPresent as unknown as (
      callback: ((value: number) => number) | undefined,
      value: number,
    ) => number;
    const lastOr = exports.lastOr as unknown as (counter: Counter, value: number) => number;
    const create = exports.createCounter as unknown as () => Counter;
    expect(callIfPresent((value) => value * 2, 4)).toBe(8);
    expect(callIfPresent(undefined, 4)).toBe(4);
    const counter = create();
    expect(lastOr(counter, 7)).toBe(7);
    counter.last = 3;
    expect(lastOr(counter, 7)).toBe(3);
  });
});
