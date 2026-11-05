import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';

// Runs native-endian integer lowering through the real CLI and JavaScript runtime. The expected
// byte order comes from an independent typed-array probe, never the build host or a fixed DataView
// endianness flag.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const FIXTURE = `pub fn native_u16_bytes() -> [u8; 2] {
    return 0x0102_u16.to_ne_bytes();
}

pub fn native_i32_bytes(value: i32) -> [u8; 4] {
    return value.to_ne_bytes();
}

pub fn first_native_byte() -> u8 {
    return 0x0102_u16.to_ne_bytes()[0];
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-native-endian-'));
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

interface NativeEndianModule {
  firstNativeByte: () => number;
  nativeI32Bytes: (value: number) => Uint8Array;
  nativeU16Bytes: () => Uint8Array;
}

function loadModule(typescript: string): NativeEndianModule {
  const javascript = ts.transpileModule(typescript, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  new Function('exports', 'module', javascript)(module.exports, module);
  return module.exports as unknown as NativeEndianModule;
}

describe('flight-compile native-endian integer bytes', () => {
  it('typechecks and derives byte order from runtime typed-array storage', () => {
    const { stderr, typescript } = compileRust('native-endian', FIXTURE);
    expect(String(stderr).trim()).toBe('');

    const file = join(workDirectory, 'native-endian.ts');
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

    const runtimeProbeBuffer = new ArrayBuffer(2);
    new Uint16Array(runtimeProbeBuffer)[0] = 0x0102;
    const runtimeProbe = new Uint8Array(runtimeProbeBuffer);
    const generated = loadModule(typescript);
    expect([...generated.nativeU16Bytes()]).toEqual([...runtimeProbe]);
    expect(generated.firstNativeByte()).toBe(runtimeProbe[0]);
    expect([...generated.nativeI32Bytes(-0x01020304)]).toEqual([
      ...new Uint8Array(new Int32Array([-0x01020304]).buffer),
    ]);
    expect(typescript).not.toContain('setUint16(0, 0x0102, true)');
  });

  it('rejects native-endian forms without proven runtime semantics', () => {
    for (const [name, rust, expected] of [
      [
        'float',
        'pub fn bytes(value: f32) -> [u8; 4] { return value.to_ne_bytes(); }\n',
        '`f32` has no proven runtime-native lowering',
      ],
      [
        'wide',
        'pub fn bytes(value: u64) -> [u8; 8] { return value.to_ne_bytes(); }\n',
        '`u64` has no proven runtime-native lowering',
      ],
      [
        'from-native',
        'pub fn value(bytes: [u8; 2]) -> u16 { return u16::from_ne_bytes(bytes); }\n',
        'portable `u16::from_ne_bytes()` has no runtime-native lowering',
      ],
    ] as const) {
      const result = compileRust(name, rust);
      expect(result.status).not.toBe(0);
      expect(String(result.stderr)).toContain(expected);
    }
  });
});
