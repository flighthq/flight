import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for the compiler's type-position lowering of `Pin<Box<dyn Future<Output = T> + Send>>`
// to `Promise<T>`, run through the real `flight-compile` CLI: the emitted capability types typecheck under
// `strict`, accept a Promise-returning implementation, reject a synchronous one, and resolve when run. Only
// `Pin`, `Box`, `Future` and auto-trait paths that resolve to the standard library lower; an imported or
// local look-alike fails closed.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const CAPABILITY_FIXTURE = `use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub struct Outcome {
    pub ok: bool,
}

pub type Exit = Pin<Box<dyn Future<Output = Outcome> + Send>>;

pub struct Capability {
    pub exit: Arc<dyn Fn() -> Exit + Send + Sync>,
}
`;

// Valid Rust that declares unrelated `Pin`, `Box` and `Future` items, and a consumer crate importing them.
const SHADOW_DEPENDENCY_FIXTURE = `use std::sync::Arc;

pub trait Future {
    type Output;
}

pub struct Box<T: ?Sized>(pub Arc<T>);
pub struct Pin<T>(pub T);
`;

const SHADOW_CONSUMER_FIXTURE = `use future_shapes::{Box, Future, Pin};

pub type LocalPending = Pin<Box<dyn Future<Output = u32>>>;
`;

// Valid \`no_std\` Rust whose \`extern crate ... as std\` makes the \`std\` root name an unrelated crate.
const EXTERN_SHADOW_DEPENDENCY_FIXTURE = `#![no_std]

pub mod pin {
    pub struct Pin<T: ?Sized>(pub *const T);
}

pub mod boxed {
    pub struct Box<T: ?Sized>(pub *const T);
}

pub mod future {
    pub trait Future {
        type Output;
    }
}
`;

const EXTERN_SHADOW_CONSUMER_FIXTURE = `#![no_std]

extern crate future_shapes as std;

pub type LocalPending = std::pin::Pin<
    std::boxed::Box<dyn std::future::Future<Output = u32>>,
>;
`;

// Valid Rust whose private \`mod std\` supplies unrelated items that ordinary \`use std::...\` imports.
const LOCAL_STD_FIXTURE = `mod std {
    pub mod pin {
        pub struct Pin<T: ?Sized>(pub *const T);
    }

    pub mod boxed {
        pub struct Box<T: ?Sized>(pub *const T);
    }

    pub mod future {
        pub trait Future {
            type Output;
        }
    }
}

use std::boxed::Box;
use std::future::Future;
use std::pin::Pin;

pub type LocalPending = Pin<Box<dyn Future<Output = u32>>>;
`;

// Valid Rust with a local \`mod std\` whose \`use ::std::...\` imports still start in the extern prelude.
const ABSOLUTE_STD_FIXTURE = `mod std {
    pub struct Local;
}

use ::std::boxed::Box;
use ::std::future::Future;
use ::std::pin::Pin;

pub type Pending = Pin<Box<dyn Future<Output = u32>>>;
`;

const QUALIFIED_FIXTURE = `extern crate alloc;

pub type Qualified = std::pin::Pin<std::boxed::Box<dyn std::future::Future<Output = u32> + std::marker::Send>>;

pub type Rooted = ::core::pin::Pin<alloc::boxed::Box<dyn core::future::Future<Output = String> + Send + Sync>>;
`;

const ALIASED_FIXTURE = `use std::boxed::Box as Owned;
use std::future::Future as Pending;
use std::marker::Send as Movable;
use std::pin::{self as pinning, Pin as Pinned};

pub type Aliased = Pinned<Owned<dyn Pending<Output = bool> + Movable>>;

pub type ModuleAliased = pinning::Pin<Owned<dyn Pending<Output = u32>>>;
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-future-'));
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

// Builds a dependency crate named \`future_shapes\` and a consumer linked against it with rustc, throwing if
// either is not valid Rust.
function buildRustCrates(dependencyRust: string, consumerRust: string): void {
  const dependency = join(workDirectory, 'future_shapes.rs');
  const consumer = join(workDirectory, 'consumer.rs');
  writeFileSync(dependency, dependencyRust);
  writeFileSync(consumer, consumerRust);
  const common = ['--edition', '2024', '--crate-type', 'lib', '--out-dir', workDirectory, '-A', 'warnings'];
  execFileSync('rustc', [...common, '--crate-name', 'future_shapes', dependency], { stdio: 'pipe' });
  execFileSync(
    'rustc',
    [
      ...common,
      '--crate-name',
      'consumer',
      '--extern',
      `future_shapes=${join(workDirectory, 'libfuture_shapes.rlib')}`,
      consumer,
    ],
    { stdio: 'pipe' },
  );
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

function strictDiagnostics(name: string, typescript: string): string[] {
  const fileName = join(workDirectory, `${name}.check.ts`);
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

describe('flight-compile pinned future lowering', () => {
  it('emits Promise types that typecheck under strict TypeScript', () => {
    const { error, typescript } = compileRust('capability', CAPABILITY_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('export type Exit = Promise<Outcome>;');
    expect(strictDiagnostics('capability', typescript)).toEqual([]);
  });

  it('accepts an asynchronous implementation and rejects a synchronous one', () => {
    const { typescript } = compileRust('capability', CAPABILITY_FIXTURE);
    const accepted = `${typescript}\nexport const capability: Capability = { exit: async () => ({ ok: true }) };\nexport const pending: Promise<Outcome> = capability.exit();\n`;
    expect(strictDiagnostics('accepted', accepted)).toEqual([]);
    const rejected = `${typescript}\nexport const capability: Capability = { exit: () => ({ ok: true }) };\n`;
    expect(strictDiagnostics('rejected', rejected).length).toBeGreaterThan(0);
  });

  it('resolves the asynchronous outcome when executed', async () => {
    const { typescript } = compileRust('capability', CAPABILITY_FIXTURE);
    const source = `${typescript}\nexport const capability: Capability = { exit: async () => ({ ok: true }) };\n`;
    const javascript = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const module = {
      exports: {} as { capability: { exit: () => Promise<{ ok: boolean }> } },
    };
    new Function('exports', 'module', javascript)(module.exports, module);
    await expect(module.exports.capability.exit()).resolves.toEqual({
      ok: true,
    });
  });

  it('lowers qualified and aliased standard paths, and the result typechecks and runs', async () => {
    const qualified = compileRust('qualified', QUALIFIED_FIXTURE);
    expect(qualified.error).toBe('');
    expect(qualified.typescript).toBe(
      'export type Qualified = Promise<number>;\n\nexport type Rooted = Promise<string>;\n\n',
    );
    const aliased = compileRust('aliased', ALIASED_FIXTURE);
    expect(aliased.error).toBe('');
    expect(aliased.typescript).toBe(
      'export type Aliased = Promise<boolean>;\n\nexport type ModuleAliased = Promise<number>;\n\n',
    );
    const usage = `${qualified.typescript}${aliased.typescript}export const run = async (): Promise<[number, string, boolean, number]> => {\n  const q: Qualified = Promise.resolve(1);\n  const r: Rooted = (async () => 'r')();\n  const a: Aliased = Promise.resolve(true);\n  const m: ModuleAliased = Promise.resolve(2);\n  return [await q, await r, await a, await m];\n};\n`;
    expect(strictDiagnostics('paths', usage)).toEqual([]);
    expect(
      strictDiagnostics('paths-rejected', `${aliased.typescript}export const a: Aliased = true;\n`).length,
    ).toBeGreaterThan(0);
    const javascript = ts.transpileModule(usage, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const module = { exports: {} as { run: () => Promise<unknown> } };
    new Function('exports', 'module', javascript)(module.exports, module);
    await expect(module.exports.run()).resolves.toEqual([1, 'r', true, 2]);
  });

  it('fails closed for the two-crate look-alike Pin, Box and Future', () => {
    // Each pair is valid Rust: rustc builds the dependency, then the consumer against it.
    for (const [dependencyFixture, consumerFixture] of [
      [SHADOW_DEPENDENCY_FIXTURE, SHADOW_CONSUMER_FIXTURE],
      [EXTERN_SHADOW_DEPENDENCY_FIXTURE, EXTERN_SHADOW_CONSUMER_FIXTURE],
    ] as const) {
      buildRustCrates(dependencyFixture, consumerFixture);
    }
    expect(compileRust('consumer', SHADOW_CONSUMER_FIXTURE).error).toBe(
      'error: portable `Pin` here resolves to `future_shapes::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`',
    );
    buildRustSource('absolute_std', ABSOLUTE_STD_FIXTURE);
    const absolute = compileRust('absolute-std', ABSOLUTE_STD_FIXTURE);
    expect(absolute).toEqual({ error: '', typescript: 'export type Pending = Promise<number>;\n\n' });
    expect(
      strictDiagnostics('absolute', `${absolute.typescript}export const pending: Pending = Promise.resolve(1);\n`),
    ).toEqual([]);
    buildRustSource('local_std', LOCAL_STD_FIXTURE);
    expect(compileRust('local-std', LOCAL_STD_FIXTURE).error).toBe(
      'error: portable `Pin` here resolves to `crate::std::pin::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`',
    );
    expect(compileRust('extern-consumer', EXTERN_SHADOW_CONSUMER_FIXTURE).error).toBe(
      'error: portable `Pin` here resolves to `future_shapes::pin::Pin`, not `std::pin::Pin`; only the standard pinned boxed future lowers to `Promise`',
    );
    for (const [rust, expected] of [
      [
        'use std::pin::Pin;\nuse future_shapes::{Box, Future};\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n',
        'error: portable `Pin<Box<dyn Future<Output = T>>>` needs `Box`, `Future` and its auto-trait bounds to resolve to the standard library',
      ],
      [
        'use future_shapes::*;\npub type P = Pin<Box<dyn Future<Output = u32>>>;\n',
        'error: cannot resolve the provenance of `Pin`; import it from `std::pin` to lower a pinned boxed future to `Promise`',
      ],
    ] as const) {
      expect(compileRust('shadow', rust).error).toBe(expected);
    }
  });

  it('fails closed for async bodies, await, and other Pin shapes', () => {
    for (const [rust, expected] of [
      ['pub async fn f() -> u32 { return 1; }\n', 'error: portable `async fn f` has no portable lowering'],
      [
        'pub fn f(x: u32) -> u32 { let y = x.await; return y; }\n',
        'error: unsupported Rust expression `await expression`',
      ],
      [
        'use std::pin::Pin;\npub type P = Pin<Box<u32>>;\n',
        'error: portable `Pin` is supported only as `Pin<Box<dyn Future<Output = T> + Send>>` in a type position',
      ],
    ] as const) {
      expect(compileRust('rejected', rust).error).toBe(expected);
    }
  });
});
