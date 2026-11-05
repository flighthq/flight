import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript5';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regressions for `get_entity_id` in generated tests, run through the real `flight-compile` CLI. The
// numeric entity id is Rust-only (D12); a test that binds it and compares it only with
// `assert_eq!`/`assert_ne!` checks allocation identity, which TypeScript compares by reference.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const PRODUCTION_FIXTURE = `pub struct Buffer {
    pub capacity: u32,
}

pub fn create_buffer(capacity: u32) -> Buffer {
    return Buffer { capacity };
}

pub fn initialize_buffer(out: &mut Buffer, capacity: u32) {
    out.capacity = capacity;
}
`;

const TEST_FIXTURE = `use crate::*;
use flight_entity::get_entity_id;

mod initialize_buffer {
    use super::*;

    #[test]
    fn keeps_the_allocation() {
        let mut buffer = create_buffer(1);
        let id = get_entity_id(&buffer);
        initialize_buffer(&mut buffer, 2);
        assert_eq!(get_entity_id(&buffer), id);
        let other = create_buffer(1);
        assert_ne!(get_entity_id(&other), id);
        assert_eq!(buffer.capacity, 2);
    }
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-entity-id-'));
  writeFileSync(join(workDirectory, 'buffer.rs'), PRODUCTION_FIXTURE);
  const production = spawnSync(
    compilerPath,
    ['generate', '--source', join(workDirectory, 'buffer.rs'), '--out', join(workDirectory, 'buffer.ts')],
    { encoding: 'utf8' },
  );
  expect(production.stderr.trim()).toBe('');
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileTests(name: string, rust: string): { error: string; typescript: string } {
  const source = join(workDirectory, `${name}_test.rs`);
  const out = join(workDirectory, `${name}.test.ts`);
  writeFileSync(source, rust);
  const result = spawnSync(
    compilerPath,
    [
      'generate-tests',
      '--source',
      source,
      '--out',
      out,
      '--contract-module',
      './buffer.ts',
      '--contract-source',
      join(workDirectory, 'buffer.rs'),
    ],
    { encoding: 'utf8' },
  );
  const error = result.stderr.trim();
  return { error, typescript: error === '' ? readFileSync(out, 'utf8') : '' };
}

function transpile(typescript: string): string {
  return ts.transpileModule(typescript, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

// Runs a generated vitest file in place against the generated production module.
function runGeneratedTests(typescript: string): void {
  const production = { exports: {} as Record<string, unknown> };
  new Function('exports', 'module', transpile(readFileSync(join(workDirectory, 'buffer.ts'), 'utf8')))(
    production.exports,
    production,
  );
  const vitest = {
    describe: (_: string, body: () => void) => body(),
    expect,
    it: (_: string, body: () => void) => body(),
  };
  const load = (specifier: string): unknown => (specifier === 'vitest' ? vitest : production.exports);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', transpile(typescript))(load, module.exports, module);
}

describe('flight-compile get_entity_id in tests', () => {
  it('lowers identity-only entity id comparisons to object identity and runs faithfully', () => {
    const { error, typescript } = compileTests('identity', TEST_FIXTURE);
    expect(error).toBe('');
    expect(typescript).toContain('const id = buffer;');
    expect(typescript).toContain('expect(buffer).toBe(id);');
    expect(typescript).toContain('expect(other).not.toBe(id);');
    expect(typescript).not.toContain('getEntityId');
    expect(() => runGeneratedTests(typescript)).not.toThrow();
  });

  it('fails a generated identity check whose allocations differ', () => {
    const { error, typescript } = compileTests(
      'mismatch',
      TEST_FIXTURE.replace('assert_ne!(get_entity_id(&other), id);', 'assert_eq!(get_entity_id(&other), id);'),
    );
    expect(error).toBe('');
    expect(() => runGeneratedTests(typescript)).toThrow();
  });

  it('refuses entity id uses beyond identity comparison', () => {
    for (const body of [
      'let id = get_entity_id(&buffer);\n        assert_eq!(id + 1, 2);',
      'assert_eq!(get_entity_id(&buffer), 1);',
      'let id = get_entity_id(&buffer);\n        let copy = id;\n        assert_eq!(copy, id);',
    ]) {
      const rust = `use crate::*;\nuse flight_entity::get_entity_id;\n\nmod checks {\n    use super::*;\n\n    #[test]\n    fn checks() {\n        let buffer = create_buffer(1);\n        ${body}\n    }\n}\n`;
      expect(compileTests('refused', rust).error).toContain('portable `get_entity_id` is Rust-only');
    }
  });
});
