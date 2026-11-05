import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';

// End-to-end regressions for empty Rust Vec locals. The real CLI must preserve a proven element type
// in strict TypeScript, and must refuse instead of emitting `never[]` or falling back to `any` when
// declared, receiver and result provenance cannot establish one safe type.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const PROVEN_FIXTURE = `pub fn declared(label: String) -> Vec<String> {
    let mut values: Vec<String> = Vec::new();
    values.push(label);
    return values;
}

pub fn receiver(value: u8) -> usize {
    let mut values = vec![];
    values.push(value);
    return values.len();
}

pub fn result(first: u8, second: u8) -> Vec<u8> {
    let mut values = Vec::with_capacity(2);
    values.push(first);
    values.push(second);
    return values;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-empty-vec-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(name: string, rust: string): { error: string; typescript: string } {
  const source = join(workDirectory, `${name}.rs`);
  const out = join(workDirectory, `${name}.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
  return {
    error: result.status === 0 ? '' : result.stderr.trim(),
    typescript: result.status === 0 ? readFileSync(out, 'utf8') : '',
  };
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

function loadModule(typescript: string): Record<string, unknown> {
  const javascript = ts.transpileModule(typescript, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  new Function('exports', 'module', javascript)(module.exports, module);
  return module.exports;
}

describe('flight-compile empty Vec element provenance', () => {
  it('emits explicit arrays that typecheck under strict TypeScript and run', () => {
    const source = join(workDirectory, 'valid.rs');
    writeFileSync(source, PROVEN_FIXTURE);
    execFileSync(
      'rustc',
      ['--edition', '2024', '--crate-type', 'lib', '--out-dir', workDirectory, '-A', 'warnings', source],
      { stdio: 'pipe' },
    );

    const { error, typescript } = compileRust('proven', PROVEN_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('let values: string[] = [];');
    expect(typescript).toContain('let values: number[] = [];');
    expect(typescript).not.toContain('never[]');
    expect(typescript).not.toContain('any[]');
    expect(strictDiagnostics(typescript)).toEqual([]);

    const exports = loadModule(typescript) as {
      declared: (label: string) => string[];
      receiver: (value: number) => number;
      result: (first: number, second: number) => number[];
    };
    expect(exports.declared('safe')).toEqual(['safe']);
    expect(exports.receiver(7)).toBe(1);
    expect(exports.result(3, 5)).toEqual([3, 5]);
  });

  it('refuses unknown, generic, conflicting and custom collection provenance', () => {
    for (const [name, rust, expected] of [
      [
        'unknown',
        'pub fn unknown() -> usize { let values = Vec::new(); return values.len(); }\n',
        'fully known, representable element type',
      ],
      [
        'generic',
        'pub fn generic<T>(value: T) -> Vec<T> { let mut values = Vec::new(); values.push(value); return values; }\n',
        'fully known, representable element type',
      ],
      [
        'conflicting',
        'pub fn conflicting() -> usize { let mut values = Vec::new(); values.push(1); values.push("x"); return values.len(); }\n',
        'conflicting element provenance',
      ],
      [
        'custom',
        'pub struct Vec { pub length: usize }\nimpl Vec { pub fn new() -> Vec { return Vec { length: 0 }; } }\npub fn custom() -> usize { let values = Vec::new(); return values.length; }\n',
        'custom or unresolved collection owners',
      ],
    ] as const) {
      const { error, typescript } = compileRust(name, rust);
      expect(error, name).toContain(expected);
      expect(error, name).not.toContain('any');
      expect(typescript, name).toBe('');
    }
  });
});
