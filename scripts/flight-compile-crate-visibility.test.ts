import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import {
  collectCrateExportSymbols,
  collectExportSymbols,
  renderGeneratedImports,
  resolveCrateExportSymbols,
} from './generate-rust-package-exports.ts';

// Regressions for crate-visible Rust items referenced across a package's modules, run through the real
// `flight-compile` CLI and the generator's import rendering: the owner exports exactly the referenced
// `pub(crate)` items through `export { … }` lists (never a public declaration export), the sibling imports
// them, and the pair typechecks under `strict` and runs.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const OWNER_FIXTURE = `pub(crate) struct Registry {
    pub(crate) count: i32,
}

pub(crate) enum Slot {
    Empty,
    Full,
}

pub(crate) const REGISTRY_LIMIT: i32 = 4;

pub(crate) fn create_registry() -> Registry {
    return Registry { count: 0 };
}

pub(crate) fn unused_helper() -> i32 {
    return 1;
}

pub fn public_value() -> i32 {
    return REGISTRY_LIMIT;
}
`;

const ALPHA_FIXTURE = `pub(crate) const LIMIT: i32 = 1;

pub(crate) struct State {
    pub(crate) value: i32,
}
`;

const BETA_FIXTURE = `pub(crate) const LIMIT: i32 = 2;

pub(crate) struct State {
    pub(crate) label: String,
}
`;

const QUALIFIED_USER_FIXTURE = `use crate::alpha::{LIMIT, State};

pub fn read_limit() -> i32 {
    let state = State { value: LIMIT };
    return state.value;
}
`;

const USER_FIXTURE = `use crate::owner::{Registry, Slot, REGISTRY_LIMIT, create_registry};

pub fn count_registry(full: bool) -> i32 {
    let registry: Registry = create_registry();
    let slot = if full { Slot::Full } else { Slot::Empty };
    return match slot {
        Slot::Empty => 0,
        Slot::Full => registry.count + REGISTRY_LIMIT,
    };
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-crate-visibility-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileRust(name: string, rust: string, sibling: string): string {
  const source = join(workDirectory, `${name}.rs`);
  const siblingSource = join(workDirectory, `${name}-sibling.rs`);
  const out = join(workDirectory, `${name}.raw.ts`);
  writeFileSync(source, rust);
  writeFileSync(siblingSource, sibling);
  const result = spawnSync(
    compilerPath,
    ['generate', '--source', source, '--out', out, '--alias-source', siblingSource],
    {
      encoding: 'utf8',
    },
  );
  expect(result.stderr.trim()).toBe('');
  return readFileSync(out, 'utf8');
}

function generatedPair(): { owner: string; user: string } {
  const ownerTypescript = compileRust('owner', OWNER_FIXTURE, USER_FIXTURE);
  const userTypescript = compileRust('user', USER_FIXTURE, OWNER_FIXTURE);
  const modules = [
    { fileName: 'owner.ts', mode: 'generate' as const, typescript: ownerTypescript },
    { fileName: 'user.ts', mode: 'generate' as const, typescript: userTypescript },
  ];
  const owners = collectCrateExportSymbols(modules);
  const publicSymbols = collectExportSymbols(modules);
  const symbolsFor = (rust: string, fileName: string) =>
    new Map([...resolveCrateExportSymbols(rust, fileName, owners), ...publicSymbols]);
  return {
    owner:
      renderGeneratedImports(OWNER_FIXTURE, ownerTypescript, 'owner.ts', symbolsFor(OWNER_FIXTURE, 'owner.ts')) +
      ownerTypescript,
    user:
      renderGeneratedImports(USER_FIXTURE, userTypescript, 'user.ts', symbolsFor(USER_FIXTURE, 'user.ts')) +
      userTypescript,
  };
}

describe('flight-compile crate-visible items', () => {
  it('keeps same-named crate-visible items of different modules apart', () => {
    const modules = new Map([
      ['alpha', ALPHA_FIXTURE],
      ['beta', BETA_FIXTURE],
      ['user', QUALIFIED_USER_FIXTURE],
    ]);
    const directory = mkdtempSync(join(workDirectory, 'modules-'));
    for (const [name, rust] of modules) writeFileSync(join(directory, `${name}.rs`), rust);
    const generated = new Map<string, string>();
    for (const name of modules.keys()) {
      const out = join(directory, `${name}.raw.ts`);
      const siblings = [...modules.keys()]
        .filter((other) => other !== name)
        .flatMap((other) => ['--alias-source', join(directory, `${other}.rs`)]);
      const result = spawnSync(
        compilerPath,
        ['generate', '--source', join(directory, `${name}.rs`), '--out', out, ...siblings],
        {
          encoding: 'utf8',
        },
      );
      expect(result.stderr.trim()).toBe('');
      generated.set(name, readFileSync(out, 'utf8'));
    }
    expect(generated.get('alpha')).toContain('export { LIMIT };');
    expect(generated.get('alpha')).toContain('export type { State };');
    expect(generated.get('beta')).not.toContain('export {');
    expect(generated.get('beta')).not.toContain('export type {');
    const exportModules = [...generated].map(([name, typescript]) => ({
      fileName: `${name}.ts`,
      mode: 'generate' as const,
      typescript,
    }));
    const owners = collectCrateExportSymbols(exportModules);
    const publicSymbols = collectExportSymbols(exportModules);
    for (const [name, typescript] of generated) {
      const symbols = new Map([
        ...resolveCrateExportSymbols(modules.get(name) ?? '', `${name}.ts`, owners),
        ...publicSymbols,
      ]);
      writeFileSync(
        join(directory, `${name}.ts`),
        renderGeneratedImports(modules.get(name) ?? '', typescript, `${name}.ts`, symbols) + typescript,
      );
    }
    expect(readFileSync(join(directory, 'user.ts'), 'utf8')).toContain("from './alpha.ts';");
    const program = ts.createProgram(
      [...modules.keys()].map((name) => join(directory, `${name}.ts`)),
      {
        allowImportingTsExtensions: true,
        lib: ['lib.es2022.d.ts'],
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
        types: [],
      },
    );
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);
    const loaded = new Map<string, Record<string, unknown>>();
    for (const name of ['alpha', 'beta', 'user']) {
      const javascript = ts.transpileModule(readFileSync(join(directory, `${name}.ts`), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const module = { exports: {} as Record<string, unknown> };
      new Function('exports', 'module', 'require', javascript)(module.exports, module, (specifier: string) =>
        loaded.get(specifier),
      );
      loaded.set(`./${name}.ts`, module.exports);
    }
    expect((loaded.get('./user.ts') as { readLimit: () => number }).readLimit()).toBe(1);
  });

  it('exports only referenced crate-visible items through lists the public scan ignores', () => {
    const { owner } = generatedPair();
    expect(owner).toContain('export { REGISTRY_LIMIT, Slot, createRegistry };');
    expect(owner).toContain('export type { Registry };');
    expect(owner).not.toContain('unusedHelper }');
    expect(owner).toContain('\nfunction createRegistry(');
    const publicNames = [
      ...collectExportSymbols([{ fileName: 'owner.ts', mode: 'generate', typescript: owner }]).keys(),
    ];
    expect(publicNames).not.toContain('Registry');
    expect(publicNames).not.toContain('REGISTRY_LIMIT');
    expect(publicNames).not.toContain('Slot');
    expect(publicNames).not.toContain('createRegistry');
    expect(publicNames).not.toContain('unusedHelper');
  });

  it('imports them into the sibling so the pair typechecks under strict TypeScript', () => {
    const { owner, user } = generatedPair();
    expect(user).toContain("import type { Registry } from './owner.ts';");
    expect(user).toContain("import { REGISTRY_LIMIT, Slot, createRegistry } from './owner.ts';");
    writeFileSync(join(workDirectory, 'owner.ts'), owner);
    writeFileSync(join(workDirectory, 'user.ts'), user);
    const program = ts.createProgram([join(workDirectory, 'owner.ts'), join(workDirectory, 'user.ts')], {
      allowImportingTsExtensions: true,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(diagnostics).toEqual([]);
  });

  it('runs across the module boundary', () => {
    const { owner, user } = generatedPair();
    const loaded = new Map<string, Record<string, unknown>>();
    const load = (name: string, typescript: string): Record<string, unknown> => {
      const javascript = ts.transpileModule(typescript, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const module = { exports: {} as Record<string, unknown> };
      const require = (specifier: string): Record<string, unknown> => {
        const dependency = loaded.get(specifier);
        if (dependency === undefined) throw new Error(`unexpected import ${specifier}`);
        return dependency;
      };
      new Function('exports', 'module', 'require', javascript)(module.exports, module, require);
      loaded.set(`./${name}.ts`, module.exports);
      return module.exports;
    };
    load('owner', owner);
    const exports = load('user', user) as { countRegistry: (full: boolean) => number };
    expect(exports.countRegistry(true)).toBe(4);
    expect(exports.countRegistry(false)).toBe(0);
  });
});
