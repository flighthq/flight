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
    { fileName: 'owner.ts', typescript: ownerTypescript },
    { fileName: 'user.ts', typescript: userTypescript },
  ];
  const symbols = new Map([...collectCrateExportSymbols(modules), ...collectExportSymbols(modules)]);
  return {
    owner: renderGeneratedImports(OWNER_FIXTURE, ownerTypescript, 'owner.ts', symbols) + ownerTypescript,
    user: renderGeneratedImports(USER_FIXTURE, userTypescript, 'user.ts', symbols) + userTypescript,
  };
}

describe('flight-compile crate-visible items', () => {
  it('exports only referenced crate-visible items through lists the public scan ignores', () => {
    const { owner } = generatedPair();
    expect(owner).toContain('export { REGISTRY_LIMIT, Slot };');
    expect(owner).toContain('export type { Registry };');
    expect(owner).not.toContain('unusedHelper }');
    const publicNames = [...collectExportSymbols([{ fileName: 'owner.ts', typescript: owner }]).keys()];
    expect(publicNames).not.toContain('Registry');
    expect(publicNames).not.toContain('REGISTRY_LIMIT');
    expect(publicNames).not.toContain('Slot');
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
