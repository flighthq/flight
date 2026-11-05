import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for the canonical noop-waker `block_on` test executor, run through the real
// `flight-compile` CLI. A proven test call lowers to one `await` of a production future inside an
// async test, evaluating the future once and rethrowing what it throws; any use whose meaning an
// `await` would change refuses instead.

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

const PRODUCTION_FIXTURE = `use flight_entity::{FlightError, throw_error};

pub type ReadResult = Result<u32, FlightError>;

pub struct Counter {
    pub calls: u32,
}

pub async fn read_counted(counter: &mut Counter) -> u32 {
    counter.calls += 1;
    return counter.calls;
}

pub async fn read_positive(value: u32) -> u32 {
    if value == 0 {
        throw_error("value must be positive");
    }
    return value;
}

pub async fn read_checked(value: u32) -> ReadResult {
    return Ok(value);
}
`;

const EXECUTOR = `use std::future::Future;
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
}`;

function testFixture(body: string, executor: string = EXECUTOR): string {
  return `use crate::*;
${executor}

mod reads {
    use super::*;

    #[test]
    fn reads() {
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
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-block-on-'));
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
// `it` run their bodies, `expect` is vitest's, `./reader.ts` is the generated production module and
// the entity contract supplies the `FlightError` throw it lowers to.
async function runGeneratedTests(typescript: string): Promise<void> {
  const reader = { exports: {} as Record<string, unknown> };
  const entity = {
    throwError: (message: string): never => {
      throw new Error(message);
    },
  };
  new Function('require', 'exports', 'module', transpile(readFileSync(join(workDirectory, 'reader.ts'), 'utf8')))(
    () => entity,
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

describe('flight-compile block_on test executor', () => {
  it('awaits each proven future once inside an async test', async () => {
    const { error, typescript } = compileTests(
      'awaited',
      testFixture(
        'let first = block_on(read_counted(&mut counter));\n        assert_eq!(first, 1);\n        assert_eq!(block_on(read_counted(&mut counter)), 2);\n        assert_eq!(counter.calls, 2);\n        assert_eq!(block_on(read_positive(3)), 3);',
      ),
    );
    expect(error).toBe('');
    expect(typescript).toContain("it('reads', async () => {");
    expect(typescript).toContain('const first = await readCounted(counter);');
    expect(typescript).toContain('expect((await readCounted(counter))).toEqual(2);');
    expect(typescript).not.toMatch(/blockOn|poll|Waker|Context|yieldNow/);
    await expect(runGeneratedTests(typescript)).resolves.toBeUndefined();
  });

  it('propagates what the awaited future throws', async () => {
    const { error, typescript } = compileTests('thrown', testFixture('block_on(read_positive(0));'));
    expect(error).toBe('');
    await expect(runGeneratedTests(typescript)).rejects.toEqual(new Error('value must be positive'));
  });

  it('refuses uses whose meaning an await would change', () => {
    for (const [body, reason] of [
      ['let read = || block_on(read_positive(1));\n        assert_eq!(read(), 1);', 'closure'],
      ['let checked = block_on(read_checked(1));\n        assert_eq!(checked, Ok(1));', 'D15 `Result` future'],
      ['assert_eq!(block_on(read_positive(block_on(read_positive(1)))), 1);', 'nested'],
      ['assert_eq!(block_on(async { 1 }), 1);', 'production `async fn`'],
    ]) {
      const { error } = compileTests('refused', testFixture(body));
      expect(error, body).toContain('executor refuses');
      expect(error, body).toContain(reason);
    }
    const custom = compileTests(
      'custom',
      testFixture(
        'block_on(read_positive(1));',
        EXECUTOR.replace('Poll::Pending => std::thread::yield_now(),', 'Poll::Pending => {}'),
      ),
    );
    expect(custom.error).not.toBe('');
    expect(custom.error).not.toContain('executor refuses');
  });
});
