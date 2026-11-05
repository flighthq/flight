import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for the canonical `FlightError` panic payload in generated tests, run through the real
// `flight-compile` CLI. A caught `FlightError` whose kind and/or message the Rust test checks lowers
// to one vitest `toThrow(..)` with the same class and message semantics; a check vitest cannot express
// exactly (a DOMException kind, a kind-only `Error`, an arbitrary payload) refuses at `catch_unwind`.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);
const entityArguments = [
  '--external-alias-source',
  join(repositoryRoot, 'crates', 'flight-entity', 'src', 'types.rs'),
  '--external-alias-module',
  '@flighthq/entity/contract',
  '--external-alias-source',
  join(repositoryRoot, 'crates', 'flight-entity', 'src', 'throw.rs'),
  '--external-alias-module',
  '@flighthq/entity/contract',
];

const PRODUCTION_FIXTURE = `use flight_entity::{throw_error, throw_range_error, throw_type_error};

pub struct Counter {
    pub calls: i32,
}

pub fn read_offset(counter: &mut Counter, offset: i32) -> i32 {
    counter.calls += 1;
    if offset < 0 {
        throw_range_error("offset is out of bounds");
    }
    return offset;
}

pub fn require_handle(handle: i32) -> i32 {
    if handle == 0 {
        throw_type_error("Downloaded update did not originate from a completed check");
    }
    return handle;
}

pub fn require_name(name: &str) -> usize {
    if name.is_empty() {
        throw_error("name (required) must be set [1/2]");
    }
    return name.len();
}
`;

const TEST_FIXTURE = `use crate::*;
use flight_entity::{FlightError, FlightErrorKind};
use std::panic::{AssertUnwindSafe, catch_unwind};

mod flight_errors {
    use super::*;

    #[test]
    fn checks_payloads() {
        let mut counter = Counter { calls: 0 };
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            read_offset(&mut counter, -1)
        }))
        .unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
        assert_eq!(error.message, "offset is out of bounds");

        let thrown = catch_unwind(|| require_handle(0)).unwrap_err();
        let error = thrown.downcast::<FlightError>().unwrap();
        assert_eq!(error.kind, FlightErrorKind::TypeError);

        let payload = catch_unwind(|| require_handle(0));
        let error = payload
            .expect_err("an unrecognized handle must throw")
            .downcast::<FlightError>()
            .expect("panic payload must be a FlightError");
        assert_eq!(error.kind, FlightErrorKind::TypeError);
        assert_eq!(
            error.message,
            "Downloaded update did not originate from a completed check"
        );

        let error = catch_unwind(|| require_name(""))
            .unwrap_err()
            .downcast::<FlightError>()
            .unwrap();
        assert_eq!(error.message, "name (required) must be set [1/2]");

        let error = catch_unwind(|| require_name("")).expect_err("empty name throws");
        let error = error.downcast_ref::<FlightError>().unwrap();
        assert_eq!(FlightErrorKind::Error, error.kind);
        assert_eq!("name (required) must be set [1/2]", error.message);

        let unused = catch_unwind(AssertUnwindSafe(|| read_offset(&mut counter, -2)));
        assert!(unused.is_err_and(|payload| {
            return payload
                .downcast_ref::<FlightError>()
                .is_some_and(|error| error.kind == FlightErrorKind::RangeError);
        }));

        let error = catch_unwind(|| require_handle(0)).unwrap_err();
        let error = error.downcast_ref::<FlightError>().unwrap();
        assert!(error.message.contains("completed check"));
        let thrown = catch_unwind(|| require_handle(0)).unwrap_err();
        assert_eq!(
            thrown
                .downcast::<flight_entity::FlightError>()
                .unwrap()
                .kind,
            flight_entity::FlightErrorKind::TypeError
        );
        assert_eq!(counter.calls, 2);
    }
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-flight-error-panic-'));
  writeFileSync(join(workDirectory, 'guard.rs'), PRODUCTION_FIXTURE);
  const production = spawnSync(
    compilerPath,
    [
      'generate',
      '--source',
      join(workDirectory, 'guard.rs'),
      '--out',
      join(workDirectory, 'guard.ts'),
      ...entityArguments,
    ],
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
      './guard.ts',
      '--contract-source',
      join(workDirectory, 'guard.rs'),
      ...entityArguments,
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
// and `./guard.ts` is the generated production module.
function runGeneratedTests(typescript: string): void {
  const guard = { exports: {} as Record<string, unknown> };
  new Function('exports', 'module', transpile(readFileSync(join(workDirectory, 'guard.ts'), 'utf8')))(
    guard.exports,
    guard,
  );
  const vitest = {
    describe: (_: string, body: () => void) => body(),
    expect,
    it: (_: string, body: () => void) => body(),
  };
  const load = (specifier: string): unknown => (specifier === 'vitest' ? vitest : guard.exports);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', transpile(typescript))(load, module.exports, module);
}

describe('flight-compile FlightError panic payloads', () => {
  it('lowers each checked FlightError payload to one exact toThrow and runs faithfully', () => {
    const { error, typescript } = compileTests('flight_errors', TEST_FIXTURE);
    expect(error).toBe('');
    for (const expected of [
      "}).toThrow(new RangeError('offset is out of bounds'));",
      "expect(() => requireHandle(0), 'an unrecognized handle must throw').toThrow(new TypeError('Downloaded update did not originate from a completed check'));",
      "expect(() => requireName('')).toThrow(/^name \\(required\\) must be set \\[1\\/2\\]$/);",
      "expect(() => requireName(''), 'empty name throws').toThrow(new Error('name (required) must be set [1/2]'));",
      'expect(() => readOffset(counter, -2)).toThrow(RangeError);',
      "expect(() => requireHandle(0)).toThrow('completed check');",
    ]) {
      expect(typescript).toContain(expected);
    }
    expect(typescript.match(/expect\(\(\) => requireHandle\(0\)\)\.toThrow\(TypeError\);/g)).toHaveLength(2);
    expect(typescript).not.toMatch(/downcast|catchUnwind|FlightError/);
    // Each closure ran once: `readOffset` counted exactly its two calls.
    expect(() => runGeneratedTests(typescript)).not.toThrow();
  });

  it('fails a generated check whose class or message differs from the thrown error', () => {
    for (const [kind, message] of [
      ['TypeError', 'offset is out of bounds'],
      ['RangeError', 'offset is out'],
      ['Error', 'offset is out of bounds'],
    ]) {
      const rust = TEST_FIXTURE.replace(
        'assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);\n        assert_eq!(error.message, "offset is out of bounds");',
        `assert_eq!(error.kind, flight_entity::FlightErrorKind::${kind});\n        assert_eq!(error.message, "${message}");`,
      );
      expect(rust).not.toBe(TEST_FIXTURE);
      const { error, typescript } = compileTests(`mismatch_${kind}`, rust);
      expect(error).toBe('');
      expect(() => runGeneratedTests(typescript)).toThrow();
    }
  });

  it('refuses FlightError checks and payloads vitest cannot express exactly', () => {
    const bind =
      'let error = std::panic::catch_unwind(|| require_handle(0)).unwrap_err();\n        let error = error.downcast_ref::<FlightError>().unwrap();\n        ';
    for (const body of [
      `${bind}assert_eq!(error.kind, FlightErrorKind::NotReadableError);`,
      `${bind}assert_eq!(error.kind, FlightErrorKind::Error);`,
      `${bind}assert_eq!(error.kind, FlightErrorKind::TypeError);\n        assert!(error.message.contains("check"));`,
      bind.trimEnd(),
      'let error = std::panic::catch_unwind(|| require_handle(0)).unwrap_err();\n        let code = error.downcast_ref::<u32>().unwrap();\n        assert_eq!(*code, 7);',
    ]) {
      const rust = `use crate::*;\nuse flight_entity::{FlightError, FlightErrorKind};\n\nmod refused {\n    use super::*;\n\n    #[test]\n    fn checks() {\n        ${body}\n    }\n}\n`;
      expect(compileTests('refused', rust).error).toContain(
        'portable `catch_unwind` is supported only as a panic assertion',
      );
    }
  });
});
