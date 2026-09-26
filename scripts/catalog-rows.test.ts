import { colladaAllElementDecoders, threeDsAllChunkHandlers } from '@flighthq/scene3d-formats';
import * as scene3dFormats from '@flighthq/scene3d-formats';
import { getThreeDsChunkName } from '@flighthq/scene3d-formats/contract';
import * as swf from '@flighthq/swf';
import { getSwfTagName } from '@flighthq/swf/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import {
  AWD2_BLOCK_HANDLERS,
  buildRequirementCatalogRows,
  CATALOG_PARSER_BACKEND,
  COLLADA_ELEMENT_DECODERS,
  SWF_TAG_HANDLERS,
  THREE_DS_CHUNK_HANDLERS,
} from './catalog-rows.ts';

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
    const namespaces = ['3ds.', 'awd2.', 'dae.', 'swf.'];
    const kinds = buildRequirementCatalogRows().map((row) => row.kind);
    expect(kinds.every((kind) => namespaces.some((namespace) => kind.startsWith(namespace)))).toBe(true);
    // Every namespace must actually be present, or the clause above passes vacuously for the formats
    // that are missing — which is precisely how a format silently drops out of the catalog.
    for (const namespace of namespaces) {
      expect(
        kinds.some((kind) => kind.startsWith(namespace)),
        `no ${namespace} rows`,
      ).toBe(true);
    }
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
  it('lists every tag handler the swf package exports, so a new handler cannot be left out', () => {
    const exported = Object.keys(swf)
      .filter((name) => isTagHandler((swf as unknown as Record<string, unknown>)[name]))
      .sort();
    expect([...SWF_TAG_HANDLERS.keys()].sort()).toEqual(exported);
  });

  it('lists every block handler the scene3d-formats package exports', () => {
    const exported = Object.keys(scene3dFormats)
      .filter((name) => isBlockHandler((scene3dFormats as unknown as Record<string, unknown>)[name]))
      .sort();
    expect([...AWD2_BLOCK_HANDLERS.keys()].sort()).toEqual(exported);
  });

  it('emits one row per code each handler declares, covering every code', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of SWF_TAG_HANDLERS) {
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(handler.tags.length);
    }
    for (const [symbol, handler] of AWD2_BLOCK_HANDLERS) {
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(handler.blockTypes.length);
    }
    for (const [symbol, handler] of THREE_DS_CHUNK_HANDLERS) {
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(handler.chunkIds.length);
    }
    // A decoder claims one feature, so it earns exactly one row — no more, and never zero.
    for (const symbol of COLLADA_ELEMENT_DECODERS.keys()) {
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(1);
    }
  });

  // ★ THE PRECISION THE ROWS EXIST FOR. A family is an array spanning several handlers, so a row that
  // named one would resolve `swf.DefineShape` to the morph-shape handler as well. Requiring the named
  // symbol to be a single handler is what keeps resolution from quietly re-inflating the bundle.
  it('names a single handler, never a family array', () => {
    for (const row of buildRequirementCatalogRows()) {
      const value = MODULES[row.implementationImport][row.implementationSymbol];
      expect(Array.isArray(value), `${row.implementationSymbol} is a family, not one handler`).toBe(false);
      expect(
        isTagHandler(value) || isBlockHandler(value) || isChunkHandler(value) || isElementDecoder(value),
        `${row.implementationSymbol}`,
      ).toBe(true);
    }
  });

  it('lists every 3DS chunk handler the scene3d-formats package exports', () => {
    const exported = Object.keys(scene3dFormats)
      .filter((name) => isChunkHandler((scene3dFormats as unknown as Record<string, unknown>)[name]))
      .sort();
    expect([...THREE_DS_CHUNK_HANDLERS.keys()].sort()).toEqual(exported);
  });

  it('lists every COLLADA element decoder the scene3d-formats package exports', () => {
    const exported = Object.keys(scene3dFormats)
      .filter((name) => isElementDecoder((scene3dFormats as unknown as Record<string, unknown>)[name]))
      .sort();
    expect([...COLLADA_ELEMENT_DECODERS.keys()].sort()).toEqual(exported);
  });

  it('routes each 3DS chunk to the handler that actually claims it', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of THREE_DS_CHUNK_HANDLERS) {
      const claimed = new Set(handler.chunkIds.map((chunkId) => `3ds.${getThreeDsChunkName(chunkId)}`));
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(claimed.has(row.kind), `${symbol} does not claim ${row.kind}`).toBe(true);
      }
    }
  });

  it('routes each COLLADA feature to the decoder that says it decodes it', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, decoder] of COLLADA_ELEMENT_DECODERS) {
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.kind, symbol).toBe(`dae.${decoder.feature}`);
      }
    }
  });

  // ★ THE ORDER IS READ FROM THE FAMILY, SO THIS COMPARES AGAINST THE FAMILY AND NOT AGAINST A LIST OF
  // EXPECTED NUMBERS. A hand-written expectation would have to be re-edited every time a family is
  // reordered, which is the moment it would instead be quietly wrong.
  it('numbers each row by its implementation position in the family the format ships', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of THREE_DS_CHUNK_HANDLERS) {
      const expected = threeDsAllChunkHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
    for (const [symbol, decoder] of COLLADA_ELEMENT_DECODERS) {
      const expected = colladaAllElementDecoders.indexOf(decoder);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
  });

  // The specific inversion the field exists to defeat, pinned so it cannot regress unnoticed: sorted by
  // kind, dae.Geometry precedes dae.Material; sorted by familyOrder, the material pass runs first.
  it('orders the COLLADA material decoder ahead of geometry, which alphabetical order does not', () => {
    const dae = buildRequirementCatalogRows().filter((row) => row.kind.startsWith('dae.'));
    const geometry = dae.find((row) => row.kind === 'dae.Geometry')!;
    const material = dae.find((row) => row.kind === 'dae.Material')!;
    expect(geometry.kind < material.kind).toBe(true);
    expect(material.familyOrder!).toBeLessThan(geometry.familyOrder!);
  });

  // AWD2 and SWF carry no position: their importers re-sort internally, so a number here would assert a
  // constraint the format does not actually have.
  it('leaves familyOrder absent for the formats whose importers re-sort internally', () => {
    for (const row of buildRequirementCatalogRows()) {
      if (row.kind.startsWith('awd2.') || row.kind.startsWith('swf.')) {
        expect(row.familyOrder, row.kind).toBeUndefined();
      } else {
        expect(row.familyOrder, row.kind).toBeTypeOf('number');
      }
    }
  });

  it('routes each tag to the handler that actually claims it', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of SWF_TAG_HANDLERS) {
      const claimed = new Set(handler.tags.map((code) => `swf.${getSwfTagName(code)}`));
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(claimed.has(row.kind), `${symbol} does not claim ${row.kind}`).toBe(true);
      }
    }
  });
});

function isTagHandler(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'tags' in value;
}

function isBlockHandler(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'blockTypes' in value;
}

function isChunkHandler(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'chunkIds' in value;
}

function isElementDecoder(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && 'feature' in value && 'decode' in value
  );
}
