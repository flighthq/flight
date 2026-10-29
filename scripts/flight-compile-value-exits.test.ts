import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for value blocks and `match` values, which lower to immediately invoked arrows, run through
// the real `flight-compile` CLI: a `return` or `?` inside one would leave only the arrow, so valid Rust that
// does so fails closed, while a closure's own `return` inside a value block still lowers and runs.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const REJECTED = [
  [
    'value_block_return',
    `pub struct Gate {
    pub enabled: bool,
    pub value: i32,
}

pub fn read(gate: &Gate) -> i32 {
    let value = {
        if !gate.enabled {
            return -1;
        }
        gate.value
    };
    return value * 2;
}
`,
    'error: portable value block cannot use `return` to leave the enclosing function; bind the value first and exit with a statement',
  ],
  [
    'match_value_return',
    `pub fn pick(flag: bool, value: i32) -> i32 {
    let picked = match flag {
        true => value,
        false => return 0,
    };
    return picked + 1;
}
`,
    'error: portable `match` used as a value cannot use `return` to leave the enclosing function; bind the value first and exit with a statement',
  ],
  [
    'value_block_try',
    `pub fn parse(value: Option<i32>) -> Option<i32> {
    let doubled = {
        let inner = value?;
        inner * 2
    };
    return Some(doubled);
}
`,
    'error: portable value block cannot use `?` to leave the enclosing function; bind the value first and exit with a statement',
  ],
] as const;

const CLOSURE_FIXTURE = `pub fn apply(values: Vec<i32>) -> Vec<i32> {
    let mapped = {
        let step = 2;
        values
            .iter()
            .map(|value| {
                return value * step;
            })
            .collect::<Vec<i32>>()
    };
    return mapped;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-value-exits-'));
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

describe('flight-compile function exits in value position', () => {
  it('fails closed on valid Rust that returns or uses ? from a value block or match value', () => {
    for (const [name, rust, message] of REJECTED) {
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
        {
          stdio: 'pipe',
        },
      );
      expect(compileRust(name, rust).error).toBe(message);
    }
  });

  it('keeps a closure return inside a value block, typechecks and runs', () => {
    const { error, typescript } = compileRust('closure', CLOSURE_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    const apply = loadModule(typescript).apply as unknown as (values: number[]) => number[];
    expect(apply([1, 2, 3])).toEqual([2, 4, 6]);
  });
});
