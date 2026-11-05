import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for explicit `panic!` statements in generated tests, run through the real
// `flight-compile` CLI. A proven test or helper panic lowers to one `throw new Error(..)` whose
// message renders exactly as Rust formats it; a panic whose unwind, control flow or formatting
// TypeScript cannot reproduce refuses instead of changing test behavior.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const PRODUCTION_FIXTURE = `pub struct Counter {
    pub calls: u32,
}

pub fn count_call(counter: &mut Counter) -> u32 {
    counter.calls += 1;
    return counter.calls;
}
`;

const HELPER = `fn record(name: &'static str, count: u32, fail: bool) {
    if fail {
        panic!("{name} failed after {} calls", count);
    } else if count > 9 {
        panic!();
    }
}`;

function testFixture(body: string, helper: string = HELPER): string {
  return `use crate::*;
use std::panic::{AssertUnwindSafe, catch_unwind};

${helper}

mod panics {
    use super::*;

    #[test]
    fn panics() {
        let mut counter = Counter { calls: 0 };
        ${body}
    }
}
`;
}

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-test-panic-'));
  writeFileSync(join(workDirectory, 'counter.rs'), PRODUCTION_FIXTURE);
  const production = spawnSync(
    compilerPath,
    ['generate', '--source', join(workDirectory, 'counter.rs'), '--out', join(workDirectory, 'counter.ts')],
    { encoding: 'utf8' },
  );
  expect(production.stderr.trim()).toBe('');
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileTests(name: string, rust: string): { error: string; typescript: string } {
  const source = join(workDirectory, `${name}_test.rs`);
  const out = join(workDirectory, `${name}.test.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(
    compilerPath,
    [
      'generate-tests',
      '--source',
      source,
      '--out',
      out,
      '--contract-module',
      './counter.ts',
      '--contract-source',
      join(workDirectory, 'counter.rs'),
    ],
    { encoding: 'utf8' },
  );
  const error = result.stderr.trim();
  return { error, typescript: error === '' ? readFileSync(out, 'utf8') : '' };
}

function transpile(typescript: string): string {
  return ts.transpileModule(typescript, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

// Runs a generated vitest file in place: its `describe`/`it` run their bodies, `expect` is vitest's,
// and `./counter.ts` is the generated production module.
function runGeneratedTests(typescript: string): void {
  const counter = { exports: {} as Record<string, unknown> };
  new Function('exports', 'module', transpile(readFileSync(join(workDirectory, 'counter.ts'), 'utf8')))(
    counter.exports,
    counter,
  );
  const vitest = {
    describe: (_: string, body: () => void) => body(),
    expect,
    it: (_: string, body: () => void) => body(),
  };
  const load = (specifier: string): unknown => (specifier === 'vitest' ? vitest : counter.exports);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', transpile(typescript))(load, module.exports, module);
}

describe('flight-compile explicit test panics', () => {
  it('lowers a proven helper panic to one thrown Error and runs the caught call once', () => {
    const { error, typescript } = compileTests(
      'caught',
      testFixture(
        'let result = catch_unwind(AssertUnwindSafe(|| record("gravity", count_call(&mut counter), true)));\n        assert!(result.is_err());\n        record("gravity", count_call(&mut counter), false);\n        assert_eq!(counter.calls, 2);',
      ),
    );
    expect(error).toBe('');
    expect(typescript).toContain('throw new Error(`${name} failed after ${count} calls`);');
    expect(typescript).toContain("throw new Error('explicit panic');");
    expect(typescript).toContain("expect(() => record('gravity', countCall(counter), true)).toThrow();");
    expect(() => runGeneratedTests(typescript)).not.toThrow();
  });

  it('throws exactly the message Rust formats', () => {
    const formatted = compileTests('formatted', testFixture('record("gravity", count_call(&mut counter), true);'));
    expect(formatted.error).toBe('');
    expect(() => runGeneratedTests(formatted.typescript)).toThrow(new Error('gravity failed after 1 calls'));

    const explicit = compileTests('explicit', testFixture('record("gravity", 10, false);'));
    expect(explicit.error).toBe('');
    expect(() => runGeneratedTests(explicit.typescript)).toThrow(new Error('explicit panic'));

    const escaped = compileTests(
      'escaped',
      testFixture(
        'fail(-1);',
        'fn fail(code: i32) {\n    if code < 0 {\n        panic!("{{code}} `${{code}}` ${code}");\n    }\n}',
      ),
    );
    expect(escaped.error).toBe('');
    expect(() => runGeneratedTests(escaped.typescript)).toThrow(new Error('{code} `${code}` $-1'));
  });

  it('refuses statement panics whose unwind, loop exit or formatting TypeScript cannot reproduce', () => {
    for (const helper of [
      'fn fail(name: &str) {\n    let count = 1;\n    if count > 0 {\n        panic!("{name}");\n    }\n}',
      'fn fail(name: &str) {\n    for _ in 0..1 {\n        panic!("{name}");\n    }\n}',
      'fn fail(name: &str) {\n    panic!("{:?}", name);\n}',
      'fn fail(value: f32) {\n    panic!("{value}");\n}',
      'fn fail(name: &str) {\n    panic!("{}", name.len());\n}',
    ]) {
      const { error } = compileTests('refused', testFixture('let _ = fail;', helper));
      expect(error, helper).toContain('portable test `panic!`');
    }
  });
});
