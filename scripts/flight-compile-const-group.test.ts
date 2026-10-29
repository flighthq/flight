import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for the compiler's `const-group` directive, run through the real `flight-compile` CLI:
// a prefixed group of public Rust constants becomes one exported TypeScript const object that typechecks
// under `strict`, keeps each literal's value, and is referenced as `Owner.Member`; importing a member
// across packages fails closed.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const KEY_FIXTURE = `//! The table.
//! flight-compiler: const-group KeyCode KEY_CODE_

/// \`KeyCode.A\`.
pub const KEY_CODE_A: i32 = 0x61;

/// B.
pub const KEY_CODE_B: i32 = 0x62;

pub const OTHER: f32 = 1.5;

pub const KEY_CODE_NUMBER_0: i32 = 0x30;

pub type KeyCode = i32;

pub fn is_a(code: KeyCode) -> bool { return code == KEY_CODE_A || code == KEY_CODE_NUMBER_0; }
`;

const KEYS_PACKAGE_FIXTURE = `//! flight-compiler: const-group KeyCode KEY_CODE_
pub const KEY_CODE_A: i32 = 0x61;
pub type KeyCode = i32;
`;

// Valid Rust that the directive must reject rather than emit invalid TypeScript for: an owner that
// collides with an emitted enum, a member computed from another member, and a qualified member path.
const OWNER_COLLISION_FIXTURE = `//! flight-compiler: const-group Status CODE_

pub const CODE_A: i32 = 1;

pub enum Status {
    Ready,
}
`;

const SELF_REFERENCE_FIXTURE = `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;
pub const CODE_B: i32 = CODE_A + 1;

pub type Code = i32;
`;

const QUALIFIED_REFERENCE_FIXTURE = `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;
pub type Code = i32;

pub fn is_a(value: Code) -> bool {
    return value == crate::CODE_A;
}
`;

// Valid Rust whose group owner collides with a binding emission adds: the `PI` local the compiler injects
// for `std::f32::consts::PI`, and the `allocateEntity` import it provides for `flight_entity::allocate_entity`.
const INJECTED_PI_FIXTURE = `//! flight-compiler: const-group PI CODE_

use std::f32::consts::PI;

pub const CODE_A: i32 = 1;

pub fn circle_area(radius: f32) -> f32 {
    return PI * radius * radius;
}
`;

const PROVIDED_IMPORT_FIXTURE = `//! flight-compiler: const-group allocateEntity CODE_

use flight_entity::allocate_entity;

pub const CODE_A: i32 = 1;

#[derive(Default)]
pub struct Record {
    pub value: i32,
}

pub fn create_record() -> Record {
    let record: Record = allocate_entity();
    return record;
}
`;

// Valid Rust whose function or closure parameter shadows the group owner in a scope that reads a member.
const PARAMETER_SHADOW_FIXTURE = `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;

#[allow(non_snake_case)]
pub fn offset(Code: i32) -> i32 {
    return Code + CODE_A;
}
`;

const PARAMETER_SHADOW_VARIANTS = [
  [
    'typed_closure',
    'Code',
    `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;

#[allow(non_snake_case)]
pub fn offset(value: i32) -> i32 {
    let add = |Code: i32| -> i32 {
        return Code + CODE_A;
    };
    return add(value);
}
`,
  ],
  [
    'untyped_closure',
    'Code',
    `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;

#[allow(non_snake_case)]
pub fn offset(values: Vec<i32>) -> Vec<i32> {
    return values.iter().map(|Code| Code + CODE_A).collect();
}
`,
  ],
  [
    'destructured_closure',
    'Code',
    `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;

#[allow(non_snake_case)]
pub fn offset(pair: (i32, i32)) -> i32 {
    let add = |(Code, b): (i32, i32)| -> i32 {
        return Code + b + CODE_A;
    };
    return add(pair);
}
`,
  ],
  [
    'nested_closure',
    'Code',
    `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;

#[allow(non_snake_case)]
pub fn offset(value: i32) -> i32 {
    let outer = |a: i32| -> i32 {
        let inner = |Code: i32| -> i32 {
            return Code + CODE_A;
        };
        return inner(a);
    };
    return outer(value);
}
`,
  ],
  [
    'renamed_parameter',
    'keyCode',
    `//! flight-compiler: const-group keyCode KEY_CODE_

pub const KEY_CODE_A: i32 = 1;

pub fn offset(key_code: i32) -> i32 {
    return key_code + KEY_CODE_A;
}
`,
  ],
] as const;

const UNSHADOWED_PARAMETER_FIXTURE = `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = 1;

pub fn offset(value: i32) -> i32 {
    let add = |code: i32| -> i32 {
        return code + CODE_A;
    };
    return add(value);
}
`;

const LITERAL_FORMS_FIXTURE = `//! flight-compiler: const-group Code CODE_

pub const CODE_A: i32 = -1;
pub const CODE_B: i32 = (0x2);

pub struct Code {
    pub x: i32,
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler', '--package', 'flight-entity'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-const-group-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(name: string, rust: string, extra: readonly string[] = []): { error: string; typescript: string } {
  const source = join(workDirectory, `${name}.rs`);
  const out = join(workDirectory, `${name}.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(compilerPath, ['generate', '--source', source, '--out', out, ...extra], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return { error: result.stderr.trim(), typescript: '' };
  return { error: '', typescript: readFileSync(out, 'utf8') };
}

// Builds one crate with rustc, throwing if it is not valid Rust.
function buildRustSource(name: string, rust: string, extra: readonly string[] = []): void {
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
      ...extra,
      source,
    ],
    { stdio: 'pipe' },
  );
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

describe('flight-compile const-group lowering', () => {
  it('emits one exported const object that typechecks under strict TypeScript', () => {
    const { error, typescript } = compileRust('keys', KEY_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('export const KeyCode = {');
    expect(typescript).not.toContain('KEY_CODE_');
    const usage = `${typescript}export const code: KeyCode = KeyCode.B;\nexport const missing = KeyCode.C;\n`;
    expect(strictDiagnostics(`${typescript}export const code: KeyCode = KeyCode.B;\n`)).toEqual([]);
    expect(strictDiagnostics(usage).length).toBeGreaterThan(0);
  });

  it('keeps member values, order, and Owner.Member references when executed', () => {
    const exports = loadModule(compileRust('keys', KEY_FIXTURE).typescript) as unknown as {
      KeyCode: Record<string, number>;
      OTHER: number;
      isA: (code: number) => boolean;
    };
    expect(Object.entries(exports.KeyCode)).toEqual([
      ['A', 0x61],
      ['B', 0x62],
      ['NUMBER_0', 0x30],
    ]);
    expect(exports.OTHER).toBe(1.5);
    expect(exports.isA(0x61)).toBe(true);
    expect(exports.isA(0x30)).toBe(true);
    expect(exports.isA(0x62)).toBe(false);
  });

  it('keeps negated and parenthesized literals beside a same-named interface', () => {
    const { error, typescript } = compileRust('literal-forms', LITERAL_FORMS_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(`${typescript}export const record: Code = { x: Code.A + Code.B };\n`)).toEqual([]);
    const exports = loadModule(typescript) as unknown as { Code: Record<string, number> };
    expect(Object.entries(exports.Code)).toEqual([
      ['A', -1],
      ['B', 2],
    ]);
  });

  it('fails closed on valid Rust whose group would emit invalid TypeScript', () => {
    for (const [name, rust, message] of [
      [
        'owner_collision',
        OWNER_COLLISION_FIXTURE,
        'error: `const-group Status` collides with an emitted enum named `Status`',
      ],
      [
        'self_reference',
        SELF_REFERENCE_FIXTURE,
        'error: `const-group Code` member `CODE_B` must be initialized with an independent literal',
      ],
      [
        'qualified_reference',
        QUALIFIED_REFERENCE_FIXTURE,
        'error: qualified `const-group` member path `crate::CODE_A` has no portable lowering; reference the member by its bare name',
      ],
    ] as const) {
      buildRustSource(name, rust);
      expect(compileRust(name, rust).error).toBe(message);
    }
  });

  it('fails closed when the owner collides with an injected or provided binding', () => {
    buildRustSource('injected_pi', INJECTED_PI_FIXTURE);
    expect(compileRust('injected-pi', INJECTED_PI_FIXTURE).error).toBe(
      'error: `const-group PI` collides with another emitted value binding named `PI`',
    );
    const debug = join(repositoryRoot, 'target', 'debug');
    buildRustSource('provided_import', PROVIDED_IMPORT_FIXTURE, [
      '-L',
      `dependency=${join(debug, 'deps')}`,
      '--extern',
      `flight_entity=${join(debug, 'libflight_entity.rlib')}`,
    ]);
    const entity = join(repositoryRoot, 'crates', 'flight-entity', 'src', 'types.rs');
    expect(
      compileRust('provided-import', PROVIDED_IMPORT_FIXTURE, [
        '--entity-module',
        '@flighthq/entity/contract',
        '--external-alias-source',
        entity,
        '--external-alias-module',
        '@flighthq/entity/contract',
      ]).error,
    ).toBe('error: `const-group allocateEntity` collides with another emitted value binding named `allocateEntity`');
  });

  it('fails closed when a function or closure parameter shadows the owner', () => {
    buildRustSource('parameter_shadow', PARAMETER_SHADOW_FIXTURE);
    expect(compileRust('parameter-shadow', PARAMETER_SHADOW_FIXTURE).error).toBe(
      'error: `const-group Code` collides with another emitted value binding named `Code`',
    );
    for (const [name, owner, rust] of PARAMETER_SHADOW_VARIANTS) {
      buildRustSource(name, rust);
      expect(compileRust(name, rust).error).toBe(
        `error: \`const-group ${owner}\` collides with another emitted value binding named \`${owner}\``,
      );
    }
  });

  it('keeps an unshadowed group reference beside parameters', () => {
    buildRustSource('unshadowed_parameter', UNSHADOWED_PARAMETER_FIXTURE);
    const { error, typescript } = compileRust('unshadowed-parameter', UNSHADOWED_PARAMETER_FIXTURE);
    expect(error).toBe('');
    expect(strictDiagnostics(typescript)).toEqual([]);
    const exports = loadModule(typescript) as unknown as { offset: (value: number) => number };
    expect(exports.offset(41)).toBe(42);
  });

  it('lowers a member imported by its Rust name through its owner, and fails closed on a wildcard import', () => {
    const keys = join(workDirectory, 'keys_package.rs');
    writeFileSync(keys, KEYS_PACKAGE_FIXTURE);
    const dependency = ['--external-alias-source', keys, '--external-alias-module', '@flighthq/keys/contract'];
    const { error, typescript } = compileRust(
      'consumer',
      'use flight_keys::{KEY_CODE_A, KEY_CODE_A as A};\npub fn is_a(code: i32) -> bool {\n    return code == KEY_CODE_A && code == A;\n}\n',
      dependency,
    );
    expect(error).toBe('');
    expect(typescript).toContain('import { KeyCode } from "@flighthq/keys/contract";');
    expect(typescript).toContain('return code === KeyCode.A && code === KeyCode.A;');
    expect(typescript).not.toContain('KEY_CODE_');
    const owner = compileRust('keys_owner', KEYS_PACKAGE_FIXTURE);
    expect(owner.error).toBe('');
    const ownerFile = join(workDirectory, 'keys-contract.ts');
    writeFileSync(ownerFile, owner.typescript);
    const consumerFile = join(workDirectory, 'consumer-check.ts');
    writeFileSync(consumerFile, typescript);
    const program = ts.createProgram([consumerFile], {
      baseUrl: workDirectory,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { '@flighthq/keys/contract': [ownerFile] },
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);
    const transpile = (source: string): string =>
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    const ownerModule = { exports: {} as Record<string, unknown> };
    new Function('exports', 'module', transpile(owner.typescript))(ownerModule.exports, ownerModule);
    const consumerModule = { exports: {} as { isA: (code: number) => boolean } };
    new Function('exports', 'module', 'require', transpile(typescript))(
      consumerModule.exports,
      consumerModule,
      () => ownerModule.exports,
    );
    expect(consumerModule.exports.isA(0x61)).toBe(true);
    expect(consumerModule.exports.isA(0x62)).toBe(false);
    expect(
      compileRust(
        'wildcard',
        'use flight_keys::*;\npub fn is_a(code: i32) -> bool {\n    return code == KEY_CODE_A;\n}\n',
        dependency,
      ).error,
    ).toBe(
      'error: a wildcard import of `@flighthq/keys/contract` would bring in `const-group` member `KEY_CODE_A` (`KeyCode.A` in TypeScript), which has no portable lowering',
    );
  });
});
