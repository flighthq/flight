import { BUILT_IN_REQUIREMENT_CATALOG_ENTRIES } from '@flighthq/requirement-catalog/contract';
import { readRequirementCatalogFile } from '@flighthq/tool-manifest/contract';

import { runRegistryTool } from './registryTool.ts';

function run(args: readonly string[]): { errors: string[]; exitCode: number; output: string[] } {
  const errors: string[] = [];
  const output: string[] = [];
  const exitCode = runRegistryTool(args, {
    writeError: (message) => errors.push(message),
    writeOutput: (message) => output.push(message),
  });
  return { errors, exitCode, output };
}

describe('runRegistryTool', () => {
  it('prints the built-in catalog as JSON a consumer can parse and act on', () => {
    const result = run(['catalog', '--json']);
    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    // The payload is the CATALOG OBJECT, so the rows live under `entries` — that shape is what lets
    // it also carry `dispositions`, which a bare array could never express.
    const rows = (JSON.parse(result.output.join('')) as { entries: readonly Record<string, string>[] }).entries;
    // The catalog ships populated, so this asserts the CLI relays real rows rather than an empty list.
    // Shape, not count: a row added to a format family must not fail an unrelated CLI test.
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.backend.length).toBeGreaterThan(0);
      expect(row.implementationImport.startsWith('@flighthq/')).toBe(true);
      expect(row.implementationSymbol.length).toBeGreaterThan(0);
    }
    // The catalog carries BOTH halves of the pipeline, and a CLI that relayed only one would hide the
    // half a consumer needs: parser rows answer a document.format requirement, render rows answer the
    // scene.node-kind requirements that format implies.
    const facets = new Set(rows.map((row) => row.facet));
    expect(facets.has('document.format')).toBe(true);
    expect(facets.has('scene.node-kind')).toBe(true);
    for (const row of rows.filter((candidate) => candidate.facet === 'document.format')) {
      expect(row.backend).toBe('parser');
      expect(row.kind).toMatch(/^(swf|awd2)\./);
    }
  });

  it('prints help successfully', () => {
    expect(run(['--help'])).toEqual({
      errors: [],
      exitCode: 0,
      output: ['Usage: tool-registry catalog --json\n'],
    });
  });

  it('rejects source-emission and unknown commands at the tool boundary', () => {
    expect(run(['generate'])).toEqual({
      errors: ['Usage: tool-registry catalog --json\n'],
      exitCode: 1,
      output: [],
    });
  });

  // ★ THE TWO CLIs MUST AGREE ON ONE SHAPE, PROVEN BY RUNNING BOTH. Each side was separately correct
  // and the pair was broken: this tool emitted a bare array, the reader requires an object, and
  // `tool-registry catalog --json | tool-manifest plan` failed on the repository's OWN catalog with
  // "catalog must be an object". No test on either side could see that, because neither ran the other.
  // Widening the reader to accept arrays was the tempting fix and the wrong one — a top-level array
  // can never carry `dispositions`, so the round trip would work while silently dropping the field
  // that says a backend deliberately does not implement something.
  it('emits a catalog the manifest tool reads back with no problems', () => {
    const result = run(['catalog', '--json']);
    expect(result.exitCode).toBe(0);

    const parsed = readRequirementCatalogFile(result.output.join(''));
    expect(parsed.problems).toEqual([]);
    expect(parsed.catalog).not.toBeNull();
    // Every row survives: a reader that dropped rows it could not parse would report no problems and
    // hand back a smaller catalog, which reads as success and builds the wrong thing.
    expect(parsed.catalog!.entries).toHaveLength(BUILT_IN_REQUIREMENT_CATALOG_ENTRIES.length);
    expect(BUILT_IN_REQUIREMENT_CATALOG_ENTRIES.length).toBeGreaterThan(0);
  });
});
