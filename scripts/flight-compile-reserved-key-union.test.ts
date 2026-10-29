import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Exercises declaration-derived reserved-key unions through the real CLI. The generated module must
// accept independently-authored structural objects under strict TypeScript and distinguish presence
// from truthiness at runtime; invalid or ambiguous declaration shapes must fail closed.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const FIXTURE = `//! flight-compiler: data-union MarkupResult=reserved-key

pub struct MarkupEffect {
    pub break_before: Option<bool>,
    pub format: Option<TextFormat>,
    pub text: Option<String>,
}

pub struct TextFormat {
    pub bold: Option<bool>,
    pub color: Option<u32>,
}

pub enum MarkupResult {
    Effect(MarkupEffect),
    Format(TextFormat),
}

pub fn classify(result: MarkupResult) -> &'static str {
    return match result {
        MarkupResult::Effect(_) => "effect",
        MarkupResult::Format(_) => "format",
    };
}

pub fn is_effect(result: &MarkupResult) -> bool {
    return matches!(result, MarkupResult::Effect(_));
}

pub fn effect(value: MarkupEffect) -> MarkupResult {
    return MarkupResult::Effect(value);
}

pub fn format(value: TextFormat) -> MarkupResult {
    return MarkupResult::Format(value);
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-reserved-key-union-'));
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

describe('flight-compile reserved-key structural unions', () => {
  it('emits strict structural types and accepts external objects from both union branches', () => {
    const { error, typescript } = compileRust('markup-result', FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('export type MarkupResult = MarkupEffect | TextFormat;');
    expect(typescript).toContain('"breakBefore" in matchValue || "format" in matchValue || "text" in matchValue');
    expect(strictDiagnostics(typescript)).toEqual([]);
    expect(
      strictDiagnostics(`${typescript}
const externalEffect: MarkupEffect = { text: "replacement" };
const externalFormat: TextFormat = { bold: true };
const emptyFormat: MarkupResult = {};
classify(externalEffect);
classify(externalFormat);
classify(emptyFormat);
`),
    ).toEqual([]);
  });

  it('tests reserved property presence and erases both constructors', () => {
    const { typescript } = compileRust('markup-result-runtime', FIXTURE);
    const module = loadModule(typescript);
    const classify = module.classify as unknown as (value: Record<string, unknown>) => string;
    const isEffect = module.isEffect as unknown as (value: Record<string, unknown>) => boolean;
    const effect = module.effect as unknown as (value: Record<string, unknown>) => Record<string, unknown>;
    const format = module.format as unknown as (value: Record<string, unknown>) => Record<string, unknown>;

    expect(classify({ text: 'replacement' })).toBe('effect');
    expect(classify({ breakBefore: false })).toBe('effect');
    expect(classify({ format: undefined })).toBe('effect');
    expect(classify({ bold: true })).toBe('format');
    expect(classify({})).toBe('format');
    expect(isEffect({ text: '' })).toBe(true);
    expect(isEffect({ color: 0 })).toBe(false);

    const effectValue = { text: 'same object' };
    const formatValue = { bold: true };
    expect(effect(effectValue)).toBe(effectValue);
    expect(format(formatValue)).toBe(formatValue);
  });

  it('fails closed for unknown, unresolved, non-record and keyless declarations', () => {
    for (const [name, rust, expected] of [
      [
        'unknown-style',
        '//! flight-compiler: data-union Value=guess\npub enum Value { First(A), Second(B) }\n',
        'unknown style `guess`',
      ],
      [
        'unresolved',
        '//! flight-compiler: data-union Value=reserved-key\npub struct Fallback { pub value: i32 }\npub enum Value { First(Missing), Second(Fallback) }\n',
        'cannot resolve reserved-key data union payload type `Missing`',
      ],
      [
        'non-record',
        '//! flight-compiler: data-union Value=reserved-key\npub struct Fallback { pub value: i32 }\npub enum Value { First(Vec<i32>), Second(Fallback) }\n',
        'cannot resolve reserved-key data union payload type `Vec`',
      ],
      [
        'keyless',
        '//! flight-compiler: data-union Value=reserved-key\npub struct Record { pub value: i32 }\npub enum Value { First(Record), Second(Record) }\n',
        'has no first-variant property absent from its fallback payload',
      ],
    ] as const) {
      const compiled = compileRust(name, rust);
      expect(compiled.typescript).toBe('');
      expect(compiled.error).toContain(expected);
    }
  });
});
