import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for the compiler's `HashSet` / `HashMap` lowering to `Set` / `Map`, run through the real
// `flight-compile` CLI: the emitted TypeScript must typecheck under `strict` and keep Rust's return values
// (`HashSet::insert` reports a new value, `HashMap::insert` / `remove` return the previous one).

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const TRACKER_FIXTURE = `use std::collections::{HashMap, HashSet};

pub struct Tracker {
    pub counts: HashMap<i32, f32>,
    pub seen: HashSet<String>,
}

pub fn create_tracker() -> Tracker {
    return Tracker {
        counts: HashMap::new(),
        seen: HashSet::with_capacity(4),
    };
}

pub fn count_tracker(tracker: &Tracker, id: i32) -> f32 {
    if !tracker.counts.contains_key(&id) {
        return -1.0;
    }
    return *tracker.counts.get(&id).unwrap_or(&0.0);
}

pub fn mark_tracker(tracker: &mut Tracker, label: String) -> bool {
    return tracker.seen.insert(label);
}

pub fn measure_tracker(tracker: &Tracker) -> usize {
    let mut local: HashSet<i32> = HashSet::default();
    local.insert(1);
    if local.contains(&1) && !tracker.seen.is_empty() {
        return tracker.seen.len() + tracker.counts.len();
    }
    return 0;
}

pub fn reset_tracker(tracker: &mut Tracker) {
    tracker.seen.clear();
    tracker.counts.clear();
}

pub fn set_tracker_count(tracker: &mut Tracker, id: i32, value: f32) -> Option<f32> {
    return tracker.counts.insert(id, value);
}

pub fn take_tracker_count(tracker: &mut Tracker, id: i32) -> Option<f32> {
    return tracker.counts.remove(&id);
}

pub fn unmark_tracker(tracker: &mut Tracker, label: &str) -> bool {
    return tracker.seen.remove(label);
}
`;

const NULLABLE_FIXTURE = `//! flight-compiler: nullable-options

use std::collections::HashMap;

pub fn get_entry(entries: &HashMap<String, i32>, key: &str) -> Option<i32> {
    if let Some(value) = entries.get(key) {
        return Some(*value);
    }
    return None;
}

pub fn put_entry(entries: &mut HashMap<String, i32>, key: String, value: i32) -> Option<i32> {
    return entries.insert(key, value);
}

pub fn take_entry(entries: &mut HashMap<String, i32>, key: &str) -> Option<i32> {
    return entries.remove(key);
}
`;

// Standard collections reached through a renamed import, `self` and submodule paths, and fully
// qualified paths, with receivers proven through a reborrowed field and a function's declared return.
const STORE_FIXTURE = `use std::collections::HashMap as Table;
use std::collections::{self, hash_set};

pub struct Store {
    pub full: std::collections::hash_map::HashMap<String, i32>,
    pub other: hash_set::HashSet<bool>,
    pub set: collections::HashSet<String>,
    pub table: Table<i32, f32>,
}

fn get_set(store: &Store) -> &collections::HashSet<String> {
    return &store.set;
}

pub fn create_store() -> Store {
    return Store {
        full: std::collections::HashMap::default(),
        other: hash_set::HashSet::with_capacity(2),
        set: collections::HashSet::new(),
        table: Table::new(),
    };
}

pub fn fill_store(store: &mut Store) -> bool {
    let table = &mut store.table;
    table.insert(1, 2.0);
    store.full.clear();
    let set = get_set(store);
    return set.contains("a") && get_set(store).is_empty() && store.other.is_empty();
}
`;

// Valid Rust whose private \`mod std\` supplies unrelated \`collections::{HashMap, HashSet}\`.
const LOCAL_STD_COLLECTIONS_FIXTURE = `mod std {
    pub mod collections {
        pub struct HashSet<T>(pub T);
        pub struct HashMap<K, V>(pub K, pub V);
    }
}

use std::collections::{HashMap, HashSet};

pub type LocalSet = HashSet<String>;
pub type LocalMap = HashMap<String, u32>;
`;

// Valid Rust where a local \`mod std\` owns \`std::collections\` but \`::std::collections\` is the standard crate.
const ABSOLUTE_STD_COLLECTIONS_FIXTURE = `mod std {
    pub mod collections {
        pub struct HashSet<T>(pub T);
    }
}

pub type LocalSet = std::collections::HashSet<String>;
pub type StandardSet = ::std::collections::HashSet<String>;

pub fn create_standard_set() -> StandardSet {
    return ::std::collections::HashSet::new();
}

pub fn mark_standard_set(set: &mut ::std::collections::HashSet<String>, value: String) -> bool {
    return set.insert(value);
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-collections-'));
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

// Builds one crate with rustc, throwing if it is not valid Rust.
function buildRustSource(name: string, rust: string): void {
  const source = join(workDirectory, `${name}.rs`);
  writeFileSync(source, rust);
  execFileSync(
    'rustc',
    [
      '--edition',
      '2024',
      '--crate-type',
      'lib',
      '--crate-name',
      name,
      '--out-dir',
      workDirectory,
      '-A',
      'warnings',
      source,
    ],
    { stdio: 'pipe' },
  );
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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = {
    exports: {} as Record<string, (...args: never[]) => unknown>,
  };
  new Function('exports', 'module', javascript)(module.exports, module);
  return module.exports;
}

type Tracker = { counts: Map<number, number>; seen: Set<string> };

describe('flight-compile HashSet and HashMap lowering', () => {
  it('typechecks the generated collections under strict TypeScript', () => {
    for (const [name, fixture] of [
      ['tracker', TRACKER_FIXTURE],
      ['nullable', NULLABLE_FIXTURE],
      ['store', STORE_FIXTURE],
    ] as const) {
      const { error, typescript } = compileRust(name, fixture);
      expect(error).toBe('');
      expect(strictDiagnostics(typescript)).toEqual([]);
    }
  });

  it('keeps Rust set semantics and return values', () => {
    const exports = loadModule(compileRust('tracker', TRACKER_FIXTURE).typescript);
    const tracker = exports.createTracker() as unknown as Tracker;
    const mark = exports.markTracker as unknown as (tracker: Tracker, label: string) => boolean;
    const unmark = exports.unmarkTracker as unknown as (tracker: Tracker, label: string) => boolean;
    const measure = exports.measureTracker as unknown as (tracker: Tracker) => number;
    expect(tracker.seen).toBeInstanceOf(Set);
    expect(measure(tracker)).toBe(0);
    expect(mark(tracker, 'a')).toBe(true);
    expect(mark(tracker, 'a')).toBe(false);
    expect(mark(tracker, 'b')).toBe(true);
    expect([...tracker.seen]).toEqual(['a', 'b']);
    expect(measure(tracker)).toBe(2);
    expect(unmark(tracker, 'a')).toBe(true);
    expect(unmark(tracker, 'a')).toBe(false);
    expect([...tracker.seen]).toEqual(['b']);
  });

  it('keeps Rust map semantics and previous-value returns', () => {
    const exports = loadModule(compileRust('tracker', TRACKER_FIXTURE).typescript);
    const tracker = exports.createTracker() as unknown as Tracker;
    const count = exports.countTracker as unknown as (tracker: Tracker, id: number) => number;
    const set = exports.setTrackerCount as unknown as (
      tracker: Tracker,
      id: number,
      value: number,
    ) => number | undefined;
    const take = exports.takeTrackerCount as unknown as (tracker: Tracker, id: number) => number | undefined;
    const measure = exports.measureTracker as unknown as (tracker: Tracker) => number;
    const reset = exports.resetTracker as unknown as (tracker: Tracker) => void;
    expect(tracker.counts).toBeInstanceOf(Map);
    expect(count(tracker, 1)).toBe(-1);
    expect(set(tracker, 1, 0)).toBeUndefined();
    expect(count(tracker, 1)).toBe(0);
    expect(set(tracker, 1, 2.5)).toBe(0);
    expect(count(tracker, 1)).toBe(2.5);
    expect(take(tracker, 1)).toBe(2.5);
    expect(take(tracker, 1)).toBeUndefined();
    expect(count(tracker, 1)).toBe(-1);
    set(tracker, 7, 1);
    (exports.markTracker as unknown as (tracker: Tracker, label: string) => boolean)(tracker, 'x');
    expect(measure(tracker)).toBe(2);
    reset(tracker);
    expect(tracker.counts.size).toBe(0);
    expect(tracker.seen.size).toBe(0);
  });

  it('reports absence as null under nullable options', () => {
    const exports = loadModule(compileRust('nullable', NULLABLE_FIXTURE).typescript);
    const get = exports.getEntry as unknown as (entries: Map<string, number>, key: string) => number | null;
    const put = exports.putEntry as unknown as (
      entries: Map<string, number>,
      key: string,
      value: number,
    ) => number | null;
    const take = exports.takeEntry as unknown as (entries: Map<string, number>, key: string) => number | null;
    const entries = new Map<string, number>();
    expect(get(entries, 'a')).toBeNull();
    expect(put(entries, 'a', 0)).toBeNull();
    expect(get(entries, 'a')).toBe(0);
    expect(put(entries, 'a', 3)).toBe(0);
    expect(take(entries, 'a')).toBe(3);
    expect(take(entries, 'a')).toBeNull();
  });

  it('lowers standard collections reached through aliased, qualified and derived paths', () => {
    const exports = loadModule(compileRust('store', STORE_FIXTURE).typescript);
    type Store = { full: Map<string, number>; other: Set<boolean>; set: Set<string>; table: Map<number, number> };
    const store = (exports.createStore as unknown as () => Store)();
    const fill = exports.fillStore as unknown as (store: Store) => boolean;
    expect(store.full).toBeInstanceOf(Map);
    expect(store.other).toBeInstanceOf(Set);
    expect(store.set).toBeInstanceOf(Set);
    expect(store.table).toBeInstanceOf(Map);
    store.full.set('x', 1);
    expect(fill(store)).toBe(false);
    expect([...store.table]).toEqual([[1, 2]]);
    expect(store.full.size).toBe(0);
    store.set.add('a');
    expect(fill(store)).toBe(false);
  });

  it('keeps collections from a local std module as ordinary types', () => {
    buildRustSource('local_std_collections', LOCAL_STD_COLLECTIONS_FIXTURE);
    expect(compileRust('local-std-collections', LOCAL_STD_COLLECTIONS_FIXTURE)).toEqual({
      error: '',
      typescript: 'export type LocalSet = HashSet<string>;\n\nexport type LocalMap = HashMap<string, number>;\n\n',
    });
  });

  it('lowers absolute std collections beside a local std module', () => {
    buildRustSource('absolute_std_collections', ABSOLUTE_STD_COLLECTIONS_FIXTURE);
    const { error, typescript } = compileRust('absolute-std-collections', ABSOLUTE_STD_COLLECTIONS_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('export type LocalSet = HashSet<string>;');
    expect(typescript).toContain('export type StandardSet = Set<string>;');
    const exports = loadModule(typescript);
    const set = (exports.createStandardSet as unknown as () => Set<string>)();
    const mark = exports.markStandardSet as unknown as (set: Set<string>, value: string) => boolean;
    expect(set).toBeInstanceOf(Set);
    expect(mark(set, 'a')).toBe(true);
    expect(mark(set, 'a')).toBe(false);
  });

  it('fails closed on standard collection names without standard provenance', () => {
    for (const [rust, message] of [
      [
        'use other::*;\npub fn a(s: &HashSet<i32>) -> usize { return s.len(); }\n',
        'error: cannot resolve the provenance of `HashSet`; import it from `std::collections` to lower it to a JavaScript collection',
      ],
      [
        'pub fn a(s: &HashMap<i32, i32>) -> usize { return s.len(); }\n',
        'error: cannot resolve the provenance of `HashMap`; import it from `std::collections` to lower it to a JavaScript collection',
      ],
      [
        'use other::HashSet;\npub fn a(s: &mut HashSet<i32>) -> bool { return s.insert(1); }\n',
        'error: unsupported Rust method call `.insert()`; impl sugar is not a transpilation source',
      ],
    ] as const) {
      expect(compileRust('provenance', rust).error).toBe(message);
    }
  });

  it('fails closed on unproven receivers, unsupported operations and identity-keyed collections', () => {
    for (const [rust, message] of [
      [
        'use other::make;\npub fn a() -> bool { return make().insert(1); }\n',
        'error: unsupported Rust method call `.insert()`; impl sugar is not a transpilation source',
      ],
      [
        'use std::collections::HashSet;\npub fn a(s: &HashSet<i32>) -> usize { return s.iter().count(); }\n',
        'error: portable `HashSet::iter` with 0 argument(s) has no portable lowering',
      ],
      [
        'use std::collections::HashMap;\npub fn a(m: &mut HashMap<i32, f32>) { m.entry(1); }\n',
        'error: portable `HashMap::entry` with 1 argument(s) has no portable lowering',
      ],
      [
        'use std::collections::HashSet;\npub struct K { pub x: i32 }\npub fn a(s: &HashSet<K>) -> usize { return s.len(); }\n',
        'error: portable `HashSet` requires a number, string or boolean key; JavaScript compares `K` keys by identity',
      ],
      [
        'use std::collections::HashMap;\npub fn a(m: &HashMap<i32, Option<f32>>) -> usize { return m.len(); }\n',
        'error: portable `HashMap` cannot hold `Option` values; `Map.get` reports a missing key and a `None` value alike',
      ],
    ] as const) {
      expect(compileRust('reject', rust).error).toBe(message);
    }
  });
});
