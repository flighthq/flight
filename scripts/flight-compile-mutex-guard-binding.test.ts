import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Exercises shared-cell binding provenance through the real CLI. Guard identity is lexical: a reference
// that shadows a guard, a guard that shadows a reference, and same-named bindings in sibling closures
// must not inherit one another's `{ value }` cell lowering. A cloned nested Ref field must write through
// to its complete source expression instead of becoming a detached TypeScript local.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const FIXTURE = `use flight_entity::Ref;
use std::sync::{Arc, Mutex};

pub struct Signal {
    pub emit: Ref<i32>,
}

pub struct SignalState {
    pub signal: Signal,
}

pub struct Owner {
    pub state: SignalState,
}

pub fn borrow_owner(owner: &Owner) -> &Owner {
    return owner;
}

pub fn replace_nested_emit(owner: &Owner, value: i32) {
    let emit = owner.state.signal.emit.clone();
    *emit.write().unwrap() = value;
}

pub fn replace_inferred_state_emit(owner: &Owner, value: i32) {
    let state = &owner.state;
    let emit = state.signal.emit.clone();
    *emit.write().unwrap() = value;
}

pub fn replace_returned_owner_emit(owner: &Owner, value: i32) {
    let emit = borrow_owner(owner).state.signal.emit.clone();
    *emit.write().unwrap() = value;
}

pub fn outer_guard_inner_reference(cell: &Arc<Mutex<i32>>, fallback: &i32) -> i32 {
    let guard = cell.lock().unwrap();
    let nested = {
        let guard = fallback;
        *guard
    };
    return guard.clone() + nested;
}

pub fn outer_reference_inner_guard(cell: &Arc<Mutex<i32>>, fallback: &i32) -> i32 {
    let guard = fallback;
    let nested = {
        let mut guard = cell.lock().unwrap();
        *guard += 1;
        *guard
    };
    return *guard + nested;
}

pub fn sibling_closures(cell: &Arc<Mutex<i32>>, fallback: &i32) -> i32 {
    let write = || -> i32 {
        let mut value = cell.lock().unwrap();
        *value += 1;
        return *value;
    };
    let read = || -> i32 {
        let value = fallback;
        return *value;
    };
    return write() + read();
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-mutex-guard-binding-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(): { error: string; typescript: string } {
  const source = join(workDirectory, 'mutex-guard-binding.rs');
  const out = join(workDirectory, 'mutex-guard-binding.ts');
  writeFileSync(source, FIXTURE);
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

describe('flight-compile MutexGuard binding provenance', () => {
  it('typechecks every shadow and sibling scope under strict TypeScript', () => {
    const { error, typescript } = compileRust();
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    expect(typescript).not.toContain('fallback.value');
  });

  it('preserves only the exact guard cell at runtime', () => {
    const module = loadModule(compileRust().typescript);
    const functions = [
      module.outerGuardInnerReference,
      module.outerReferenceInnerGuard,
      module.siblingClosures,
    ] as unknown as ((cell: { value: number }, fallback: number) => number)[];

    const outer = { value: 4 };
    expect(functions[0](outer, 3)).toBe(7);
    expect(outer.value).toBe(4);

    for (const run of functions.slice(1)) {
      const cell = { value: 4 };
      expect(run(cell, 3)).toBe(8);
      expect(cell.value).toBe(5);
    }
  });
});

describe('flight-compile nested Ref alias provenance', () => {
  it('typechecks the complete nested write-through target under strict TypeScript', () => {
    const { error, typescript } = compileRust();
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    expect(typescript).toContain('const emit = owner.state.signal.emit;');
    expect(typescript).toContain('owner.state.signal.emit = value;');
    expect(typescript).not.toMatch(/^\s*emit = value;$/mu);
  });

  it('typechecks inferred struct-field locals under strict TypeScript', () => {
    const { error, typescript } = compileRust();
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    expect(typescript).toContain('const state = owner.state;');
    expect(typescript).toContain('const emit = state.signal.emit;');
    expect(typescript).toContain('state.signal.emit = value;');
  });

  it('typechecks declared struct-returning call receivers under strict TypeScript', () => {
    const { error, typescript } = compileRust();
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    expect(typescript).toContain('const emit = borrowOwner(owner).state.signal.emit;');
    expect(typescript).toContain('borrowOwner(owner).state.signal.emit = value;');
  });

  it('writes through every declared struct layer at runtime', () => {
    const module = loadModule(compileRust().typescript);
    type Owner = { state: { signal: { emit: number } } };
    const owner: Owner = { state: { signal: { emit: 1 } } };
    const replaceNestedEmit = module.replaceNestedEmit as unknown as (owner: Owner, value: number) => void;

    replaceNestedEmit(owner, 7);

    expect(owner.state.signal.emit).toBe(7);
  });

  it('writes through a struct-valued field inferred into a local', () => {
    const module = loadModule(compileRust().typescript);
    type Owner = { state: { signal: { emit: number } } };
    const owner: Owner = { state: { signal: { emit: 1 } } };
    const replaceInferredStateEmit = module.replaceInferredStateEmit as unknown as (
      owner: Owner,
      value: number,
    ) => void;

    replaceInferredStateEmit(owner, 8);

    expect(owner.state.signal.emit).toBe(8);
  });

  it('writes through a declared struct-returning call receiver', () => {
    const module = loadModule(compileRust().typescript);
    type Owner = { state: { signal: { emit: number } } };
    const owner: Owner = { state: { signal: { emit: 1 } } };
    const replaceReturnedOwnerEmit = module.replaceReturnedOwnerEmit as unknown as (
      owner: Owner,
      value: number,
    ) => void;

    replaceReturnedOwnerEmit(owner, 9);

    expect(owner.state.signal.emit).toBe(9);
  });
});
