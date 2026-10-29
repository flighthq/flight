import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for fixed arrays of typed-array primitives (`[f64; N]` is `Float64Array`) outside `let` and
// return sites, run through the real `flight-compile` CLI: literals pushed into `Vec<[f64; N]>` locals and
// fields construct typed arrays, constants are typed arrays, a fixed typed array passed to an immutable
// primitive slice becomes a `number[]` copy, and a mutable slice is rejected. The output typechecks under
// `strict` and runs.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const FIXTURE = `pub const SQUARE: [f64; 4] = [0.0, 1.0, 2.0, 3.0];

pub struct Holder {
    pub edges: Vec<[f64; 2]>,
}

pub fn sum(values: &[f64]) -> f64 {
    let mut total = 0.0;
    for value in values {
        total += *value;
    }
    return total;
}

pub fn collect(a: f64, b: f64) -> Vec<[f64; 2]> {
    let mut out: Vec<[f64; 2]> = Vec::new();
    out.push([a, b]);
    out.push([b, a]);
    return out;
}

pub fn hold(a: f64) -> Holder {
    let mut holder = Holder { edges: Vec::new() };
    holder.edges.push([a, a]);
    return holder;
}

pub fn square_sum() -> f64 {
    return sum(&SQUARE);
}

pub fn local_sum(a: f64) -> f64 {
    let pair: [f64; 2] = [a, 2.0 * a];
    return sum(&pair);
}

pub fn vec_sum(a: f64) -> f64 {
    let values: Vec<f64> = vec![a, a];
    return sum(&values);
}
`;

const MUTABLE_SLICE_FIXTURE = `pub fn scale_all(values: &mut [f64], factor: f64) {
    for index in 0..values.len() {
        values[index] *= factor;
    }
}

pub fn scaled(a: f64) -> [f64; 2] {
    let mut pair: [f64; 2] = [a, a];
    scale_all(&mut pair, 2.0);
    return pair;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-fixed-typed-arrays-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(name: string, rust: string): ReturnType<typeof spawnSync> & { typescript: string } {
  const source = join(workDirectory, `${name}.rs`);
  const out = join(workDirectory, `${name}.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out], { encoding: 'utf8' });
  return {
    ...result,
    typescript: result.status === 0 ? readFileSync(out, 'utf8') : '',
  };
}

describe('flight-compile fixed typed arrays', () => {
  it('constructs typed arrays at push, constant and slice-argument sites', () => {
    const { stderr, typescript } = compileRust('fixed', FIXTURE);
    expect(String(stderr).trim()).toBe('');
    expect(typescript).toContain('export const SQUARE: Float64Array = new Float64Array([0.0, 1.0, 2.0, 3.0]);');
    expect(typescript).toContain('  out.push(new Float64Array([a, b]));');
    expect(typescript).toContain('  holder.edges.push(new Float64Array([a, a]));');
    expect(typescript).toContain('  return sum(Array.from(SQUARE));');
    expect(typescript).toContain('  return sum(Array.from(pair));');
    expect(typescript).toContain('  return sum(values);');
  });

  it('typechecks under strict TypeScript and runs', () => {
    const { typescript } = compileRust('fixed', FIXTURE);
    const file = join(workDirectory, 'fixed.ts');
    const program = ts.createProgram([file], {
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      noEmit: true,
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
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const module = { exports: {} as Record<string, unknown> };
    new Function('exports', 'module', javascript)(module.exports, module);
    const exports = module.exports as {
      collect: (a: number, b: number) => Float64Array[];
      hold: (a: number) => { edges: Float64Array[] };
      localSum: (a: number) => number;
      squareSum: () => number;
      vecSum: (a: number) => number;
    };
    const collected = exports.collect(1, 2);
    expect(collected.every((edge) => edge instanceof Float64Array)).toBe(true);
    expect(collected.map((edge) => [...edge])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(exports.hold(3).edges[0]).toBeInstanceOf(Float64Array);
    expect(exports.squareSum()).toBe(6);
    expect(exports.localSum(2)).toBe(6);
    expect(exports.vecSum(2)).toBe(4);
  });

  it('rejects a fixed typed array passed to a mutable slice', () => {
    const { status, stderr } = compileRust('mutable', MUTABLE_SLICE_FIXTURE);
    expect(status).not.toBe(0);
    expect(String(stderr)).toContain('cannot be passed to the mutable slice argument 0 of `scale_all`');
  });
});
