import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for intentionally unused Rust bindings, run through the real `flight-compile` CLI: a
// leading underscore survives lowering, so TypeScript's own unused-binding checks read it the same way
// Rust does instead of seeing a capitalized name (`_out` once lowered to `Out`).

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const SOURCE_FIXTURE = `pub fn initialize_handle(_out: &mut i32) {}

pub fn count_samples(values: &[f64]) -> usize {
    return values.iter().map(|_delta_time: &f64| 1).count();
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-unused-bindings-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

describe('flight-compile unused bindings', () => {
  it('keeps leading underscores so strict unused-parameter checks pass, and runs', () => {
    const source = join(workDirectory, 'source.rs');
    const out = join(workDirectory, 'source.ts');
    writeFileSync(source, SOURCE_FIXTURE);
    const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
    expect(result.stderr.trim()).toBe('');
    const typescript = readFileSync(out, 'utf8');
    expect(typescript).toContain('initializeHandle(_out: number)');
    expect(typescript).toContain('(_deltaTime: number) =>');
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
    const module = { exports: {} as { countSamples: (values: number[]) => number } };
    new Function('exports', 'module', javascript)(module.exports, module);
    expect(module.exports.countSamples([0.5, 1.5, 2.5])).toBe(3);
  });
});
