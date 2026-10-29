import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getOxcUnsupportedSourcePaths, getParsedOxcSource, getParsedOxcSourceUnlessUnsupported } from './oxc-source.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let workDirectory = '';

beforeAll(() => {
  workDirectory = mkdtempSync(join(tmpdir(), 'oxc-source-'));
  writeFileSync(join(workDirectory, 'awaitLabel.ts'), 'interface Callable {\n  run: (await: number) => void;\n}\n');
  writeFileSync(join(workDirectory, 'broken.ts'), 'export const value = ;\n');
  writeFileSync(join(workDirectory, 'valid.ts'), 'export const value = 1;\n');
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

describe('getOxcUnsupportedSourcePaths', () => {
  it('keeps only exact TypeScript file paths from the ignore patterns', () => {
    const config = JSON.stringify({
      ignorePatterns: [
        'OVERVIEW.md',
        'agents/',
        'crates/',
        'packages/haptics/src/callableTypes.test.ts',
        'packages/**/*.generated.ts',
        '**/*.toml',
      ],
    });
    expect([...getOxcUnsupportedSourcePaths(config)]).toEqual(['packages/haptics/src/callableTypes.test.ts']);
  });

  it('lists in the repository only sources Oxc still cannot parse', () => {
    const paths = getOxcUnsupportedSourcePaths(readFileSync(join(repositoryRoot, '.oxfmtrc.json'), 'utf-8'));
    expect([...paths]).toEqual(['packages/haptics/src/callableTypes.test.ts']);
    for (const path of paths) {
      expect(() => getParsedOxcSource(join(repositoryRoot, path))).toThrow(/Could not parse/);
    }
  });

  it('returns no paths when the config has no ignore patterns', () => {
    expect(getOxcUnsupportedSourcePaths('{}').size).toBe(0);
  });
});

describe('getParsedOxcSource', () => {
  it('throws on syntax Oxc rejects', () => {
    expect(() => getParsedOxcSource(join(workDirectory, 'awaitLabel.ts'))).toThrow(/Could not parse/);
  });
});

describe('getParsedOxcSourceUnlessUnsupported', () => {
  it('skips a listed source that Oxc cannot parse', () => {
    expect(
      getParsedOxcSourceUnlessUnsupported(
        join(workDirectory, 'awaitLabel.ts'),
        workDirectory,
        new Set(['awaitLabel.ts']),
      ),
    ).toBeNull();
  });

  it('still fails on an unparseable source that is not listed', () => {
    expect(() =>
      getParsedOxcSourceUnlessUnsupported(join(workDirectory, 'broken.ts'), workDirectory, new Set(['awaitLabel.ts'])),
    ).toThrow(/Could not parse/);
  });

  it('parses a listed source that Oxc accepts', () => {
    const parsed = getParsedOxcSourceUnlessUnsupported(
      join(workDirectory, 'valid.ts'),
      workDirectory,
      new Set(['valid.ts']),
    );
    expect(parsed?.program.body).toHaveLength(1);
  });
});
