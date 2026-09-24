import * as scene3dFormats from '@flighthq/scene3d-formats';
import * as swf from '@flighthq/swf';
import { RequirementFacet } from '@flighthq/types/contract';

import {
  AWD2_BLOCK_FAMILIES,
  buildRequirementCatalogRows,
  CATALOG_PARSER_BACKEND,
  SWF_TAG_FAMILIES,
} from './catalog-rows';

const MODULES: Readonly<Record<string, Record<string, unknown>>> = {
  '@flighthq/scene3d-formats': scene3dFormats as unknown as Record<string, unknown>,
  '@flighthq/swf': swf as unknown as Record<string, unknown>,
};

describe('buildRequirementCatalogRows', () => {
  it('produces a non-empty catalog, because an empty one resolves nothing for anybody', () => {
    expect(buildRequirementCatalogRows().length).toBeGreaterThan(0);
  });

  // ★ WHAT MAKES A ROW FACT RATHER THAN CLAIM. A catalog row is an instruction to emit
  // `import { <symbol> } from '<module>'` into a user's build. If the symbol is misspelled or moves,
  // nothing here would notice — the row still looks well-formed, and the failure surfaces as a broken
  // generated module in someone else's project. So every row is checked against the real module.
  it('names only symbols the module actually exports, on the lane an application can import', () => {
    for (const row of buildRequirementCatalogRows()) {
      const module = MODULES[row.implementationImport];
      expect(module, `no module for ${row.implementationImport}`).toBeDefined();
      expect(
        module[row.implementationSymbol],
        `${row.implementationImport} has no ${row.implementationSymbol}`,
      ).toBeDefined();
    }
  });

  it('namespaces every kind by format, so two formats cannot claim one key', () => {
    const kinds = buildRequirementCatalogRows().map((row) => row.kind);
    expect(kinds.every((kind) => kind.startsWith('swf.') || kind.startsWith('awd2.'))).toBe(true);
    // Both namespaces must actually be present, or this passes vacuously on a single-format catalog.
    expect(kinds.some((kind) => kind.startsWith('swf.'))).toBe(true);
    expect(kinds.some((kind) => kind.startsWith('awd2.'))).toBe(true);
  });

  it('carries no registrar, because a tag family is named in options and never registered', () => {
    for (const row of buildRequirementCatalogRows()) {
      expect(row.registrarSymbol).toBeUndefined();
      expect(row.registrarImport).toBeUndefined();
    }
  });

  it('populates the parser backend only, since a tag name is not a renderer key', () => {
    const backends = new Set(buildRequirementCatalogRows().map((row) => row.backend));
    expect([...backends]).toEqual([CATALOG_PARSER_BACKEND]);
  });

  it('files every row under document.format', () => {
    for (const row of buildRequirementCatalogRows()) {
      expect(row.facet).toBe(RequirementFacet.DocumentFormat);
    }
  });

  it('is deterministic, so regenerating never produces a spurious diff', () => {
    expect(buildRequirementCatalogRows()).toEqual(buildRequirementCatalogRows());
  });

  it('gives each tag or block exactly one owner, with no duplicate kind', () => {
    const kinds = buildRequirementCatalogRows().map((row) => row.kind);
    expect(kinds.length).toBe(new Set(kinds).size);
  });

  // ★ GROUND TRUTH THE BUILDER DID NOT DERIVE. The family lists in catalog-rows.ts are written by hand
  // so they grep and so the catalog states what ships. That hand-written list is exactly the thing that
  // can silently fall behind, and a test that re-read the same list would agree with itself. So the
  // expectation comes from the format packages' own exported surface instead.
  it('lists every tag family the swf package exports, so a new family cannot be left out', () => {
    const exported = Object.keys(swf)
      .filter((name) => name.endsWith('TagFamily'))
      .sort();
    expect([...SWF_TAG_FAMILIES.keys()].sort()).toEqual(exported);
  });

  it('lists every block family the scene3d-formats package exports', () => {
    const exported = Object.keys(scene3dFormats)
      .filter((name) => name.startsWith('awd2') && name.endsWith('Family'))
      .sort();
    expect([...AWD2_BLOCK_FAMILIES.keys()].sort()).toEqual(exported);
  });

  it('emits one row per tag code each family declares, covering every code', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, family] of SWF_TAG_FAMILIES) {
      const declared = family.flatMap((handler) => handler.tags).length;
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(declared);
    }
    for (const [symbol, family] of AWD2_BLOCK_FAMILIES) {
      const declared = family.flatMap((handler) => handler.blockTypes).length;
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(declared);
    }
  });
});
