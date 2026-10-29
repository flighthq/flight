import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for `Arc::ptr_eq`, run through the real `flight-compile` CLI. It lowers to `===`, which
// compares allocations only when the payload lowers to an object; a primitive or unit payload lowers to
// its value, where `===` would report two distinct Rust allocations as the same, so it fails closed.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const IDENTITY_FIXTURE = `use std::any::Any;
use std::sync::{Arc, Mutex};

pub type ProviderRef = Arc<dyn Any + Send + Sync>;

pub struct Node {
    pub value: i32,
}

pub struct Source {
    pub provider: ProviderRef,
    pub node: Arc<Node>,
    pub cell: Arc<Mutex<i32>>,
}

pub fn same_source(a: &Source, b: &Source) -> bool {
    return Arc::ptr_eq(&a.provider, &b.provider)
        && Arc::ptr_eq(&a.node, &b.node)
        && Arc::ptr_eq(&a.cell, &b.cell);
}

pub fn fresh_nodes_differ() -> bool {
    let first = Arc::new(Node { value: 1 });
    let second = Arc::new(Node { value: 1 });
    let alias = first.clone();
    return Arc::ptr_eq(&first, &alias) && !Arc::ptr_eq(&first, &second);
}
`;

const I32_FIXTURE = `use std::sync::Arc;

pub fn fresh_numbers_differ() -> bool {
    let first = Arc::new(1);
    let second = Arc::new(1);
    return !Arc::ptr_eq(&first, &second);
}
`;

const UNIT_FIXTURE = `use std::sync::Arc;

pub fn same(a: &Arc<()>, b: &Arc<()>) -> bool {
    return Arc::ptr_eq(a, b);
}
`;

const REJECTION =
  'error: portable `Arc::ptr_eq` needs an operand proven to hold an identity-bearing payload (a struct, collection, callable, `Mutex` cell or `dyn Any`); a primitive or unit payload lowers to its value, so `===` would compare values instead of allocations';

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-pointer-equality-'));
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

describe('flight-compile Arc::ptr_eq', () => {
  it('compares identity-bearing payloads by allocation under strict TypeScript', () => {
    const { error, out } = compileRust('identity', IDENTITY_FIXTURE);
    expect(error).toBe('');
    const typescript = readFileSync(out, 'utf8');
    expect(typescript).toContain('return (first === alias) && !(first === second);');
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
        freshNodesDiffer: () => boolean;
        sameSource: (a: object, b: object) => boolean;
      },
    };
    new Function('exports', 'module', javascript)(module.exports, module);
    expect(module.exports.freshNodesDiffer()).toBe(true);
    const shared = { provider: {}, node: { value: 1 }, cell: { value: 2 } };
    expect(module.exports.sameSource(shared, { ...shared })).toBe(true);
    expect(module.exports.sameSource(shared, { ...shared, node: { value: 1 } })).toBe(false);
  });

  it('rejects an i32 payload, whose lowering would report distinct allocations as equal', () => {
    expect(compileRust('i32', I32_FIXTURE).error).toBe(REJECTION);
  });

  it('rejects a unit payload, whose lowering is undefined for every allocation', () => {
    expect(compileRust('unit', UNIT_FIXTURE).error).toBe(REJECTION);
  });
});
