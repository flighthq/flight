import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for shadowing clones, run through the real `flight-compile` CLI: `let x = x.clone()` over
// a shared handle erases to the binding itself and emits no `x = x` self-assignment, while a shadow that
// computes a new value still rebinds.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const SOURCE_FIXTURE = `use std::sync::Arc;

pub struct Node {
    pub value: i32,
}

pub fn reader(node: Arc<Node>) -> Arc<dyn Fn() -> i32 + Send + Sync> {
    return Arc::new({
        let node = node.clone();
        move || {
            return node.value;
        }
    });
}

pub fn offset(node: &Arc<Node>, delta: i32) -> i32 {
    let node = Arc::clone(node);
    let delta = delta + 1;
    return node.value + delta;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-shadow-clone-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

describe('flight-compile shadowing clones', () => {
  it('emits no self-assignment, typechecks strictly, and runs', () => {
    const source = join(workDirectory, 'source.rs');
    const out = join(workDirectory, 'source.ts');
    writeFileSync(source, SOURCE_FIXTURE);
    const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
    expect(result.stderr.trim()).toBe('');
    const typescript = readFileSync(out, 'utf8');
    expect(typescript).not.toContain('node = node');
    expect(typescript).toContain('delta = delta + 1;');
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
        offset: (node: { value: number }, delta: number) => number;
        reader: (node: { value: number }) => () => number;
      },
    };
    new Function('exports', 'module', javascript)(module.exports, module);
    const node = { value: 4 };
    const read = module.exports.reader(node);
    node.value = 7;
    expect(read()).toBe(7);
    expect(module.exports.offset(node, 2)).toBe(10);
  });
});
