import {
  colladaAllElementDecoders,
  md2AllSectionHandlers,
  md5AllSectionHandlers,
  objAllMaterialHandlers,
  threeDsAllChunkHandlers,
} from '@flighthq/scene3d-formats';
import * as scene3dFormats from '@flighthq/scene3d-formats';
import { getThreeDsChunkName } from '@flighthq/scene3d-formats/contract';
import {
  dragonBonesAllSectionHandlers,
  dragonBonesAllTimelineHandlers,
  spineBinaryAllSectionHandlers,
  spineBinaryAllTimelineHandlers,
  spineJsonAllSectionHandlers,
  spineJsonAllTimelineHandlers,
} from '@flighthq/skeleton2d-formats/contract';
import * as skeleton2dFormatsContract from '@flighthq/skeleton2d-formats/contract';
import * as swf from '@flighthq/swf';
import { getSwfTagName } from '@flighthq/swf/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import {
  AWD2_BLOCK_HANDLERS,
  buildRequirementCatalogRows,
  CATALOG_PARSER_BACKEND,
  COLLADA_ELEMENT_DECODERS,
  DRAGONBONES_SECTION_HANDLERS,
  DRAGONBONES_TIMELINE_HANDLERS,
  MD2_SECTION_HANDLERS,
  MD5_SECTION_HANDLERS,
  OBJ_MATERIAL_HANDLERS,
  SPINE_BINARY_SECTION_HANDLERS,
  SPINE_BINARY_TIMELINE_HANDLERS,
  SPINE_JSON_SECTION_HANDLERS,
  SPINE_JSON_TIMELINE_HANDLERS,
  SWF_TAG_HANDLERS,
  THREE_DS_CHUNK_HANDLERS,
} from './catalog-rows.ts';

const MODULES: Readonly<Record<string, Record<string, unknown>>> = {
  '@flighthq/scene3d-formats': scene3dFormats as unknown as Record<string, unknown>,
  '@flighthq/skeleton2d-formats/contract': skeleton2dFormatsContract as unknown as Record<string, unknown>,
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
    const namespaces = [
      '3ds.',
      'awd2.',
      'dae.',
      'dragonbones.',
      'md2.',
      'md5.',
      'obj.',
      'spine-binary.',
      'spine-json.',
      'swf.',
    ];
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
    // A decoder earns one row for every coarse or sub-element feature it claims.
    for (const [symbol, decoder] of COLLADA_ELEMENT_DECODERS) {
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(decoder.features.length);
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
        isTagHandler(value) ||
          isBlockHandler(value) ||
          isChunkHandler(value) ||
          isElementDecoder(value) ||
          isSectionHandler(value) ||
          isMaterialHandler(value) ||
          isSpineBinaryHandler(value) ||
          isSpineJsonHandler(value) ||
          isDragonBonesHandler(value),
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
      const claimed = new Set(decoder.features.map((feature) => `dae.${feature}`));
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(claimed.has(row.kind), `${symbol} does not claim ${row.kind}`).toBe(true);
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

  it('lists every MD2 section handler the scene3d-formats package exports', () => {
    const exported = Object.keys(scene3dFormats)
      .filter((name) => isSectionHandler((scene3dFormats as unknown as Record<string, unknown>)[name]))
      .filter((name) => name.startsWith('md2'))
      .sort();
    expect([...MD2_SECTION_HANDLERS.keys()].sort()).toEqual(exported);
  });

  it('lists every MD5 section handler the scene3d-formats package exports', () => {
    const exported = Object.keys(scene3dFormats)
      .filter((name) => isSectionHandler((scene3dFormats as unknown as Record<string, unknown>)[name]))
      .filter((name) => name.startsWith('md5'))
      .sort();
    expect([...MD5_SECTION_HANDLERS.keys()].sort()).toEqual(exported);
  });

  it('routes each MD2 and MD5 feature to the handler that says it satisfies it', () => {
    const rows = buildRequirementCatalogRows();
    for (const [namespace, handlers] of [
      ['md2', MD2_SECTION_HANDLERS],
      ['md5', MD5_SECTION_HANDLERS],
    ] as const) {
      for (const [symbol, handler] of handlers) {
        for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
          expect(row.kind, symbol).toBe(`${namespace}.${handler.feature}`);
        }
      }
    }
  });

  // Written as two loops rather than one over a pair of families: pairing them unions the two handler
  // types, and `indexOf` then demands their intersection — a type error the scripts test run cannot see,
  // since vitest does not typecheck.
  it('numbers each MD2 and MD5 row by its position in the family the format ships', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of MD2_SECTION_HANDLERS) {
      const expected = md2AllSectionHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
    for (const [symbol, handler] of MD5_SECTION_HANDLERS) {
      const expected = md5AllSectionHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
  });

  // ★ THE ALWAYS-READ FEATURES GET NO ROW, DELIBERATELY. `Mesh` is what makes an MD2 or MD5 file a model —
  // there is nothing to opt out of and no handler to name — so a row for it could only name something that
  // does not exist. Asserted so a later sweep does not "fix" the apparent gap by inventing one.
  it('emits no row for the geometry features that are always read', () => {
    const kinds = new Set(buildRequirementCatalogRows().map((row) => row.kind));
    expect(kinds.has('md2.Mesh')).toBe(false);
    expect(kinds.has('md5.Mesh')).toBe(false);
  });

  it('lists every OBJ material handler the scene3d-formats package exports', () => {
    const exported = Object.keys(scene3dFormats)
      .filter((name) => isMaterialHandler((scene3dFormats as unknown as Record<string, unknown>)[name]))
      .sort();
    expect([...OBJ_MATERIAL_HANDLERS.keys()].sort()).toEqual(exported);
  });

  // ★ THE ROW THAT COULD NOT EXIST BEFORE. Both handlers answered one coarse `obj.Material` key, and two
  // rows for one key collide under the catalog's own identity, so OBJ had no parser row at all. Each handler
  // declares the shading model it reads now, which is what splits the key and makes the rows derivable.
  it('routes each OBJ shading model to the handler that reads it, one row each', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of OBJ_MATERIAL_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`obj.${handler.feature}`);
      expect(matching[0].familyOrder, symbol).toBe(objAllMaterialHandlers.indexOf(handler));
    }
  });

  // The coarse key is what the OBJ text alone can report, and it answers neither "which renderer" nor
  // "which handler". Asserted absent so nobody reintroduces a row nothing can resolve precisely.
  it('emits no row for the coarse obj.Material key', () => {
    expect(buildRequirementCatalogRows().some((row) => row.kind === 'obj.Material')).toBe(false);
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

  it('lists every Spine binary section handler the skeleton2d-formats contract exports', () => {
    const exported = Object.keys(skeleton2dFormatsContract)
      .filter(
        (name) =>
          name.startsWith('spineBinary') &&
          name.endsWith('SectionHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (skeleton2dFormatsContract as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(SPINE_BINARY_SECTION_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('lists every Spine binary timeline handler the skeleton2d-formats contract exports', () => {
    const exported = Object.keys(skeleton2dFormatsContract)
      .filter(
        (name) =>
          name.startsWith('spineBinary') &&
          name.endsWith('TimelineHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (skeleton2dFormatsContract as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(SPINE_BINARY_TIMELINE_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('emits one row per Spine binary handler, each routed to its declared kind', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, , kind] of SPINE_BINARY_SECTION_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`spine-binary.${kind}`);
    }
    for (const [symbol, , kind] of SPINE_BINARY_TIMELINE_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`spine-binary.${kind}`);
    }
  });

  it('numbers each Spine binary row by its position in the family the format ships', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of SPINE_BINARY_SECTION_HANDLERS) {
      const expected = spineBinaryAllSectionHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
    for (const [symbol, handler] of SPINE_BINARY_TIMELINE_HANDLERS) {
      const expected = spineBinaryAllTimelineHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
  });

  it('sets parserField on Spine binary rows to split section and timeline handlers', () => {
    const rows = buildRequirementCatalogRows();
    for (const row of rows.filter((candidate) => candidate.kind.startsWith('spine-binary.'))) {
      const isSectionKind = SPINE_BINARY_SECTION_HANDLERS.some(([, , kind]) => row.kind === `spine-binary.${kind}`);
      expect(row.parserField, row.kind).toBe(isSectionKind ? 'sectionHandlers' : 'timelineHandlers');
    }
  });

  it('imports Spine binary handlers from the contract lane', () => {
    for (const row of buildRequirementCatalogRows().filter((r) => r.kind.startsWith('spine-binary.'))) {
      expect(row.implementationImport).toBe('@flighthq/skeleton2d-formats/contract');
    }
  });

  it('lists every Spine JSON section handler the skeleton2d-formats contract exports', () => {
    const exported = Object.keys(skeleton2dFormatsContract)
      .filter(
        (name) =>
          name.startsWith('spineJson') &&
          name.endsWith('SectionHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (skeleton2dFormatsContract as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(SPINE_JSON_SECTION_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('lists every Spine JSON timeline handler the skeleton2d-formats contract exports', () => {
    const exported = Object.keys(skeleton2dFormatsContract)
      .filter(
        (name) =>
          name.startsWith('spineJson') &&
          name.endsWith('TimelineHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (skeleton2dFormatsContract as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(SPINE_JSON_TIMELINE_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('emits one row per Spine JSON handler, each routed to its declared kind', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, , kind] of SPINE_JSON_SECTION_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`spine-json.${kind}`);
    }
    for (const [symbol, , kind] of SPINE_JSON_TIMELINE_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`spine-json.${kind}`);
    }
  });

  it('numbers each Spine JSON row by its position in the family the format ships', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of SPINE_JSON_SECTION_HANDLERS) {
      const expected = spineJsonAllSectionHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
    for (const [symbol, handler] of SPINE_JSON_TIMELINE_HANDLERS) {
      const expected = spineJsonAllTimelineHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
  });

  it('sets parserField on Spine JSON rows to split section and timeline handlers', () => {
    const rows = buildRequirementCatalogRows();
    for (const row of rows.filter((candidate) => candidate.kind.startsWith('spine-json.'))) {
      const isSectionKind = SPINE_JSON_SECTION_HANDLERS.some(([, , kind]) => row.kind === `spine-json.${kind}`);
      expect(row.parserField, row.kind).toBe(isSectionKind ? 'sectionHandlers' : 'timelineHandlers');
    }
  });

  it('imports Spine JSON handlers from the contract lane', () => {
    for (const row of buildRequirementCatalogRows().filter((r) => r.kind.startsWith('spine-json.'))) {
      expect(row.implementationImport).toBe('@flighthq/skeleton2d-formats/contract');
    }
  });

  it('lists every DragonBones section handler the skeleton2d-formats contract exports', () => {
    const exported = Object.keys(skeleton2dFormatsContract)
      .filter(
        (name) =>
          name.startsWith('dragonBones') &&
          name.endsWith('SectionHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (skeleton2dFormatsContract as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(DRAGONBONES_SECTION_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('lists every DragonBones timeline handler the skeleton2d-formats contract exports', () => {
    const exported = Object.keys(skeleton2dFormatsContract)
      .filter(
        (name) =>
          name.startsWith('dragonBones') &&
          name.endsWith('TimelineHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (skeleton2dFormatsContract as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(DRAGONBONES_TIMELINE_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('emits one row per DragonBones handler, each routed to its declared kind', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, , kind] of DRAGONBONES_SECTION_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`dragonbones.${kind}`);
    }
    for (const [symbol, , kind] of DRAGONBONES_TIMELINE_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`dragonbones.${kind}`);
    }
  });

  it('numbers each DragonBones row by its position in the family the format ships', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of DRAGONBONES_SECTION_HANDLERS) {
      const expected = dragonBonesAllSectionHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
    for (const [symbol, handler] of DRAGONBONES_TIMELINE_HANDLERS) {
      const expected = dragonBonesAllTimelineHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
  });

  it('sets parserField on DragonBones rows to split section and timeline handlers', () => {
    const rows = buildRequirementCatalogRows();
    for (const row of rows.filter((candidate) => candidate.kind.startsWith('dragonbones.'))) {
      const isSectionKind = DRAGONBONES_SECTION_HANDLERS.some(([, , kind]) => row.kind === `dragonbones.${kind}`);
      expect(row.parserField, row.kind).toBe(isSectionKind ? 'sectionHandlers' : 'timelineHandlers');
    }
  });

  it('imports DragonBones handlers from the contract lane', () => {
    for (const row of buildRequirementCatalogRows().filter((r) => r.kind.startsWith('dragonbones.'))) {
      expect(row.implementationImport).toBe('@flighthq/skeleton2d-formats/contract');
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

// MD2 and MD5 section handlers: a `feature` they satisfy plus the `collect` that reads it. Distinguished
// from a COLLADA decoder by `collect` rather than `decode`.
function isSectionHandler(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && 'feature' in value && 'collect' in value
  );
}

// An OBJ material handler: the `feature` it reads plus the matches/resolve pair that reads it.
function isMaterialHandler(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && 'matches' in value && 'resolve' in value
  );
}

function isElementDecoder(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && 'features' in value && 'decode' in value
  );
}

function isSpineBinaryHandler(value: unknown): boolean {
  return typeof value === 'function';
}

function isSpineJsonHandler(value: unknown): boolean {
  return typeof value === 'function';
}

function isDragonBonesHandler(value: unknown): boolean {
  return typeof value === 'function';
}
