import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for the D15 `Result<T, FlightError>` promise convention, run through the real
// `flight-compile` CLI: a proven async `Ok` resolves and `Err` rejects with the canonical error object
// (`new RangeError(message)`), in production returns, in test provider closures returning
// `Box::pin(async move { result })`, and in `block_on` assertions, each evaluated once.

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

const PRODUCTION_FIXTURE = `use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{FlightError, FlightErrorKind};

pub type ReadResult = Result<u32, FlightError>;

pub type ReadFuture = Pin<Box<dyn Future<Output = ReadResult> + Send>>;

pub struct Counter {
    pub calls: u32,
}

pub struct Reader {
    pub read: Arc<dyn Fn(u32) -> ReadFuture + Send + Sync>,
}

pub async fn read_checked(counter: &mut Counter, value: u32, error: &FlightError) -> ReadResult {
    counter.calls += 1;
    if value == 0 {
        return Err(error.clone());
    }
    if value > 9 {
        return Err(FlightError {
            kind: FlightErrorKind::RangeError,
            message: "value is too large".to_string(),
        });
    }
    Ok(value)
}

pub async fn read_from(reader: &Reader, value: u32) -> ReadResult {
    return (reader.read)(value).await;
}
`;

const TEST_FIXTURE = `use crate::*;
use flight_entity::{FlightError, FlightErrorKind};
use std::future::Future;
use std::sync::Arc;
use std::task::{Context, Poll, Waker};

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

fn rejected(message: &str) -> FlightError {
    return FlightError {
        kind: FlightErrorKind::TypeError,
        message: message.to_string(),
    };
}

fn reader() -> Reader {
    return Reader {
        read: Arc::new(move |value: u32| {
            let result = if value == 0 {
                Err(rejected("empty read"))
            } else {
                Ok(value * 2)
            };
            return Box::pin(async move { result });
        }),
    };
}

mod reads {
    use super::*;

    #[test]
    fn resolves_ok_and_rejects_err() {
        let mut counter = Counter { calls: 0 };
        let error = rejected("value must be positive");
        assert_eq!(block_on(read_checked(&mut counter, 4, &error)), Ok(4));
        assert_eq!(block_on(read_checked(&mut counter, 0, &error)), Err(error.clone()));
        assert_eq!(
            block_on(read_checked(&mut counter, 10, &error)),
            Err(FlightError {
                kind: FlightErrorKind::RangeError,
                message: "value is too large".to_string(),
            })
        );
        assert_eq!(counter.calls, 3);
        assert_eq!(block_on(read_from(&reader(), 2)), Ok(4));
        assert_eq!(block_on(read_from(&reader(), 0)), Err(rejected("empty read")));
    }
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-d15-result-'));
  mkdirSync(join(workDirectory, 'src'));
  writeFileSync(join(workDirectory, 'src', 'reader.rs'), PRODUCTION_FIXTURE);
  writeFileSync(join(workDirectory, 'src', 'contract.rs'), 'pub use crate::reader::*;\n');
  const production = spawnSync(
    compilerPath,
    [
      'generate',
      '--source',
      join(workDirectory, 'src', 'reader.rs'),
      '--out',
      join(workDirectory, 'reader.ts'),
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
      './reader.ts',
      '--contract-source',
      join(workDirectory, 'src', 'contract.rs'),
      '--alias-source',
      join(workDirectory, 'src', 'reader.rs'),
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

// Runs a generated vitest file in place and settles every (possibly async) test body: `describe`/
// `it` run their bodies, `expect` is vitest's and `./reader.ts` is the generated production module.
async function runGeneratedTests(typescript: string): Promise<void> {
  const reader = { exports: {} as Record<string, unknown> };
  new Function('require', 'exports', 'module', transpile(readFileSync(join(workDirectory, 'reader.ts'), 'utf8')))(
    () => ({}),
    reader.exports,
    reader,
  );
  const pending: unknown[] = [];
  const vitest = {
    describe: (_: string, body: () => void) => body(),
    expect,
    it: (_: string, body: () => unknown) => {
      pending.push(body());
    },
  };
  const load = (specifier: string): unknown => (specifier === 'vitest' ? vitest : reader.exports);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', transpile(typescript))(load, module.exports, module);
  await Promise.all(pending);
}

describe('flight-compile D15 Result promises', () => {
  it('lowers production returns to resolution and canonical rejection', () => {
    const production = readFileSync(join(workDirectory, 'reader.ts'), 'utf8');
    expect(production).toContain('export type ReadResult = number;');
    expect(production).toContain('    throw error;');
    expect(production).toContain("    throw new RangeError('value is too large');");
    expect(production).toContain('  return value;');
    expect(production).not.toMatch(/\bErr\(|\bOk\(|FlightErrorKind/);
  });

  it('resolves Ok and rejects Err with the canonical error, evaluating each call once', async () => {
    const { error, typescript } = compileTests('results', TEST_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('return (async () => {');
    expect(typescript).toContain('expect(await readChecked(counter, 4, error)).toEqual(4);');
    expect(typescript).toContain('await expect(readChecked(counter, 0, error)).rejects.toEqual(error);');
    expect(typescript).toContain(
      "await expect(readChecked(counter, 10, error)).rejects.toEqual(new RangeError('value is too large'));",
    );
    expect(typescript).toContain('expect(counter.calls).toEqual(3);');
    expect(typescript).not.toMatch(/\bErr\(|\bOk\(|FlightErrorKind|blockOn/);
    await expect(runGeneratedTests(typescript)).resolves.toBeUndefined();
  });

  it('fails a generated check whose kind or message differs from the rejection', async () => {
    for (const [kind, message] of [
      ['TypeError', 'value is too large'],
      ['RangeError', 'value is too'],
    ]) {
      const rust = TEST_FIXTURE.replace(
        'kind: FlightErrorKind::RangeError,\n                message: "value is too large".to_string(),',
        `kind: FlightErrorKind::${kind},\n                message: "${message}".to_string(),`,
      );
      expect(rust).not.toBe(TEST_FIXTURE);
      const { error, typescript } = compileTests(`mismatch_${kind}`, rust);
      expect(error).toBe('');
      await expect(runGeneratedTests(typescript)).rejects.toThrow();
    }
  });

  it('refuses Result uses the D15 convention cannot express', () => {
    for (const [replace, by, reason] of [
      [
        'assert_eq!(block_on(read_from(&reader(), 2)), Ok(4));',
        'let read = block_on(read_from(&reader(), 2));\n        assert_eq!(read, Ok(4));',
        'D15 `Result` future',
      ],
      [
        'Err(rejected("empty read"))',
        'Err(FlightError { kind: FlightErrorKind::NotSupportedError, message: String::new() })',
        'DOMException',
      ],
      [
        'return Box::pin(async move { result });',
        'let again = result.clone();\n            return Box::pin(async move { again });',
        'outside a proven D15 async return',
      ],
    ]) {
      const rust = TEST_FIXTURE.replace(replace, by);
      expect(rust).not.toBe(TEST_FIXTURE);
      expect(compileTests('refused', rust).error, by).toContain(reason);
    }
  });
});
