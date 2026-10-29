import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for the compiler's `Vec::retain` lowering and its fail-closed `std::mem` detection, run
// through the real `flight-compile` CLI: the emitted TypeScript must typecheck under `strict` and behave
// like Rust's retain, including the unwind cleanup when the predicate throws.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const RANGE_FIXTURE = `pub struct Range {
    pub start: u32,
    pub end: u32,
}

pub fn drop_empty(ranges: &mut Vec<Range>) {
    ranges.retain(|range| range.start < range.end);
}
`;

const THROWING_FIXTURE = `use flight_entity::throw_error;

pub fn retain_even_until(values: &mut Vec<i32>, stop: i32) {
    values.retain(|value| {
        if *value == stop {
            throw_error("stop");
        }
        return *value % 2 == 0;
    });
}
`;

const TRACE_FIXTURE = `pub fn retain_trace(values: &mut Vec<i32>) -> Vec<i32> {
    let mut seen: Vec<i32> = Vec::new();
    values.retain(|value| {
        seen.push(*value);
        return *value % 2 == 0;
    });
    return seen;
}
`;

const REPLACE_FIXTURE = `pub struct Slot {
    pub value: u32,
    pub items: Vec<u32>,
}

pub fn swap_value(slot: &mut Slot, next: u32) -> u32 {
    return std::mem::replace(&mut slot.value, next);
}

pub fn swap_items(slot: &mut Slot, next: Vec<u32>) -> Vec<u32> {
    return std::mem::replace(&mut slot.items, next);
}

pub fn first(values: &mut Vec<u32>, next: u32) -> u32 {
    return std::mem::replace(&mut values[0], next);
}

pub fn local(seed: u32) -> u32 {
    let mut current = seed;
    let previous = std::mem::replace(&mut current, seed + 1);
    return previous + current;
}
`;

const SWAP_FIXTURE = `pub struct Joint {
    pub ax: f64,
    pub bx: f64,
}

pub fn flip(j: &mut Joint) {
    std::mem::swap(&mut j.ax, &mut j.bx);
}

pub fn order(values: &mut Vec<i32>) {
    if values[0] > values[1] {
        let (first, second) = (0, 1);
        values.swap(first, second);
    }
    std::mem::swap(&mut values[2], &mut values[3]);
}

pub fn ordered(a: i32, b: i32) -> i32 {
    let mut low = a;
    let mut high = b;
    if low > high {
        std::mem::swap(&mut low, &mut high);
    }
    return high - low;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-retain-'));
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

describe('flight-compile Vec retain lowering', () => {
  it('typechecks the generated retain under strict TypeScript', () => {
    const { error, typescript } = compileRust('range', RANGE_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    for (const [name, fixture] of [
      ['throwing', THROWING_FIXTURE],
      ['trace', TRACE_FIXTURE],
    ] as const) {
      const compiled = compileRust(name, fixture);
      expect(compiled.error).toBe('');
      expect(strictDiagnostics(compiled.typescript)).toEqual([]);
    }
  });

  it('keeps the container, survivor identity and order, and calls the predicate once forward', () => {
    const { typescript } = compileRust('range', RANGE_FIXTURE);
    const dropEmpty = loadModule(typescript).dropEmpty as unknown as (ranges: { start: number; end: number }[]) => void;
    const a = { start: 0, end: 1 };
    const b = { start: 2, end: 2 };
    const c = { start: 3, end: 5 };
    const d = { start: 6, end: 6 };
    const ranges = [a, b, c, d];
    const container = ranges;
    dropEmpty(ranges);
    expect(ranges).toBe(container);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toBe(a);
    expect(ranges[1]).toBe(c);

    const empty: { start: number; end: number }[] = [];
    dropEmpty(empty);
    expect(empty).toEqual([]);

    const retainTrace = loadModule(compileRust('trace', TRACE_FIXTURE).typescript).retainTrace as unknown as (
      values: number[],
    ) => number[];
    const values = [5, 2, 7, 4, 6];
    expect(retainTrace(values)).toEqual([5, 2, 7, 4, 6]);
    expect(values).toEqual([2, 4, 6]);
  });

  it('matches Rust retain unwind cleanup when the predicate throws', () => {
    const { typescript } = compileRust('throwing', THROWING_FIXTURE);
    const retainEvenUntil = loadModule(typescript).retainEvenUntil as unknown as (
      values: number[],
      stop: number,
    ) => void;
    // Each expectation is what Rust leaves after `catch_unwind` around the same retain (see the compiler's
    // vec_retain_unwind_reference test): kept elements, then the throwing element and the unprocessed tail.
    for (const [input, stop, expected] of [
      [[1, 2, 3, 4], 3, [2, 3, 4]],
      [[1, 3, 5, 2, 7, 9], 7, [2, 7, 9]],
      [[2, 4, 6], 4, [2, 4, 6]],
      [[1, 2, 3], 1, [1, 2, 3]],
      [[1, 2, 3, 4], 99, [2, 4]],
    ] as const) {
      const values = [...input];
      const container = values;
      try {
        retainEvenUntil(values, stop);
      } catch {
        // The thrown predicate error propagates, as a Rust panic does.
      }
      expect(values).toBe(container);
      expect(values).toEqual(expected);
    }
  });
});

describe('flight-compile std::mem imports', () => {
  it('fails closed for direct, aliased, grouped, module and wildcard std::mem imports', () => {
    for (const [rust, name] of [
      ['use std::mem::take;\npub fn f(v: &mut Vec<u32>) -> Vec<u32> { return take(v); }\n', 'take'],
      ['use std::mem::take as grab;\npub fn f(v: &mut Vec<u32>) -> Vec<u32> { return grab(v); }\n', 'take'],
      ['use std::mem::{replace, swap};\npub fn f(a: &mut u32, b: &mut u32) { swap(a, b); }\n', 'swap'],
      [
        'use std::{mem::{self as m}, vec::Vec};\npub fn f(v: &mut Vec<u32>) -> Vec<u32> { return m::take(v); }\n',
        'take',
      ],
      ['use std::mem as m;\npub fn f(v: &mut Vec<u32>) -> Vec<u32> { return m::take(v); }\n', 'take'],
      ['use std::mem::*;\npub fn f(v: &mut Vec<u32>) -> Vec<u32> { return take(v); }\n', 'take'],
      ['use core::mem::replace;\npub fn f(v: &mut u32) -> u32 { return replace(v, 1); }\n', 'replace'],
    ] as const) {
      expect(compileRust('mem', rust).error).toBe(`error: portable \`std::mem::${name}\` has no portable lowering`);
    }
  });

  it('replaces caller-visible places under strict TypeScript and at runtime', () => {
    const { error, typescript } = compileRust('replace', REPLACE_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    const module = loadModule(typescript) as unknown as {
      first: (values: number[], next: number) => number;
      local: (seed: number) => number;
      swapItems: (slot: { value: number; items: number[] }, next: number[]) => number[];
      swapValue: (slot: { value: number; items: number[] }, next: number) => number;
    };
    const slot = { value: 3, items: [1] };
    expect(module.swapValue(slot, 4)).toBe(3);
    expect(slot.value).toBe(4);
    expect(module.swapItems(slot, [2])).toEqual([1]);
    expect(slot.items).toEqual([2]);
    const values = [7, 8];
    expect(module.first(values, 9)).toBe(7);
    expect(values).toEqual([9, 8]);
    expect(module.local(5)).toBe(11);
  });

  it('swaps caller-visible places under strict TypeScript and at runtime', () => {
    const { error, typescript } = compileRust('swap', SWAP_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    const module = loadModule(typescript) as unknown as {
      flip: (joint: { ax: number; bx: number }) => void;
      order: (values: number[]) => void;
      ordered: (a: number, b: number) => number;
    };
    const joint = { ax: 1, bx: 2 };
    module.flip(joint);
    expect(joint).toEqual({ ax: 2, bx: 1 });
    const values = [5, 4, 3, 2];
    module.order(values);
    expect(values).toEqual([4, 5, 2, 3]);
    expect(module.ordered(9, 2)).toBe(7);
  });

  it('fails closed for reference parameters and reborrows, whose swap the caller would not see', () => {
    for (const rust of [
      'pub fn f(a: &mut u32, b: &mut u32) { std::mem::swap(a, b); }\n',
      'pub fn f(a: &mut u32, b: &mut u32) { std::mem::swap(&mut *a, &mut *b); }\n',
    ]) {
      expect(compileRust('reference', rust).error).toBe('error: portable `std::mem::swap` has no portable lowering');
    }
  });

  it('keeps a local function that shadows a wildcard std::mem import', () => {
    const { error, typescript } = compileRust(
      'shadow',
      'use std::mem::*;\nfn take(v: u32) -> u32 { return v; }\npub fn f(v: u32) -> u32 { return take(v); }\n',
    );
    expect(error).toBe('');
    expect(typescript).toContain('function take(v: number): number {');
    expect(typescript).toContain('return (take(v)) >>> 0;');
  });
});
