import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for a tuple destructure that shadows a binding still in scope, run through the real
// `flight-compile` CLI. The new binding is renamed in TypeScript, so every later read (including an
// implicitly captured `format!` argument) must resolve to the rename, and a nested tuple pattern must not
// read the name it is declaring (a TDZ error). Plain destructuring keeps its direct form.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const SOURCE_FIXTURE = `pub fn describe_release(kind: u32) -> String {
    let (kind, label) = match kind {
        0 => (10, "zero"),
        _ => (20, "other"),
    };
    return format!("{kind}:{label}");
}

pub fn shift_value(value: i32) -> i32 {
    let (value, extra) = (value + 1, 2);
    return value + extra;
}

pub fn scale_nested(value: i32) -> i32 {
    let ((value, extra), scale) = ((value + 1, 2), 3);
    return (value + extra) * scale;
}

pub fn sum_pair(pair: (i32, i32)) -> i32 {
    let (left, right) = pair;
    return left + right;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-shadow-destructure-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

describe('flight-compile shadowing tuple destructures', () => {
  it('reads renamed shadow bindings, avoids nested TDZ reads, passes strict unused checks, and runs', () => {
    const source = join(workDirectory, 'source.rs');
    const out = join(workDirectory, 'source.ts');
    writeFileSync(source, SOURCE_FIXTURE);
    const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
    expect(result.stderr.trim()).toBe('');
    const typescript = readFileSync(out, 'utf8');
    expect(typescript).toContain('return `${kind_1}:${label}`;');
    expect(typescript).toContain('const [left, right] = pair;');
    const program = ts.createProgram([out], {
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
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
        describeRelease: (kind: number) => string;
        scaleNested: (value: number) => number;
        shiftValue: (value: number) => number;
        sumPair: (pair: readonly [number, number]) => number;
      },
    };
    new Function('exports', 'module', javascript)(module.exports, module);
    expect(module.exports.describeRelease(0)).toBe('10:zero');
    expect(module.exports.describeRelease(7)).toBe('20:other');
    expect(module.exports.shiftValue(1)).toBe(4);
    expect(module.exports.scaleNested(1)).toBe(12);
    expect(module.exports.sumPair([2, 3])).toBe(5);
  });
});
