import * as bitmapfontFormatsContract from '@flighthq/bitmapfont-formats/contract';
import * as particlesFormatsContract from '@flighthq/particles-formats/contract';
import {
  createRiveImportRegistry,
  lottieAllLayerHandlers,
  lottieAllShapeItemHandlers,
  riveAllPathBooleanRegistrars,
  riveAllRegistrars,
  svgAllElementHandlers,
} from '@flighthq/scene2d-formats';
import * as scene2dFormats from '@flighthq/scene2d-formats';
import * as scene2dFormatsContract from '@flighthq/scene2d-formats/contract';
import {
  colladaAllElementDecoders,
  md2AllSectionHandlers,
  md5AllSectionHandlers,
  objAllMaterialHandlers,
  threeDsAllChunkHandlers,
} from '@flighthq/scene3d-formats';
import * as scene3dFormats from '@flighthq/scene3d-formats';
import { getThreeDsChunkName, THREE_DS_REQUIREMENT_KEY_NAMESPACE } from '@flighthq/scene3d-formats/contract';
import * as scene3dFormatsContract from '@flighthq/scene3d-formats/contract';
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
import * as swfContract from '@flighthq/swf/contract';
import * as tilemapFormatsContract from '@flighthq/tilemap-formats/contract';
import { RequirementFacet, THREE_DS_MATERIAL_TEXTURE_MAP } from '@flighthq/types/contract';

import { ALWAYS_READ_FORMAT_FEATURES } from './catalog-dispositions.ts';
import {
  AWD2_BLOCK_HANDLERS,
  buildRequirementCatalogRows,
  CATALOG_PARSER_BACKEND,
  COLLADA_ELEMENT_DECODERS,
  DRAGONBONES_SECTION_HANDLERS,
  DRAGONBONES_TIMELINE_HANDLERS,
  LOTTIE_LAYER_HANDLERS,
  LOTTIE_MASK_HANDLERS,
  LOTTIE_SHAPE_ITEM_HANDLERS,
  MD2_SECTION_HANDLERS,
  MD5_SECTION_HANDLERS,
  OBJ_MATERIAL_HANDLERS,
  SPINE_BINARY_SECTION_HANDLERS,
  SPINE_BINARY_TIMELINE_HANDLERS,
  SPINE_JSON_SECTION_HANDLERS,
  SPINE_JSON_TIMELINE_HANDLERS,
  SVG_CLIP_HANDLERS,
  SVG_ELEMENT_HANDLERS,
  SWF_TAG_HANDLERS,
  THREE_DS_CHUNK_HANDLERS,
} from './catalog-rows.ts';

const MODULES: Readonly<Record<string, Record<string, unknown>>> = {
  '@flighthq/bitmapfont-formats': bitmapfontFormatsContract as unknown as Record<string, unknown>,
  '@flighthq/particles-formats/contract': particlesFormatsContract as unknown as Record<string, unknown>,
  '@flighthq/scene2d-formats': scene2dFormats as unknown as Record<string, unknown>,
  '@flighthq/scene3d-formats': scene3dFormats as unknown as Record<string, unknown>,
  '@flighthq/scene3d-formats/contract': scene3dFormatsContract as unknown as Record<string, unknown>,
  '@flighthq/skeleton2d-formats/contract': skeleton2dFormatsContract as unknown as Record<string, unknown>,
  '@flighthq/swf': swf as unknown as Record<string, unknown>,
  '@flighthq/tilemap-formats/contract': tilemapFormatsContract as unknown as Record<string, unknown>,
};
// Every lane that OWNS a requirement-key namespace constant. The format package names its own namespace; this
// list is which modules to ask, not what the answer is.
const NAMESPACE_MODULES: readonly (readonly [string, Record<string, unknown>])[] = [
  ['@flighthq/bitmapfont-formats/contract', bitmapfontFormatsContract as unknown as Record<string, unknown>],
  ['@flighthq/particles-formats/contract', particlesFormatsContract as unknown as Record<string, unknown>],
  ['@flighthq/scene2d-formats/contract', scene2dFormatsContract as unknown as Record<string, unknown>],
  ['@flighthq/scene3d-formats/contract', scene3dFormatsContract as unknown as Record<string, unknown>],
  ['@flighthq/skeleton2d-formats/contract', skeleton2dFormatsContract as unknown as Record<string, unknown>],
  ['@flighthq/swf/contract', swfContract as unknown as Record<string, unknown>],
  ['@flighthq/tilemap-formats/contract', tilemapFormatsContract as unknown as Record<string, unknown>],
];

// Reads the namespaces one module declares. A format's namespace is a string constant it exports, so asking the
// module is the same identity the analyzer and the catalog both build keys from.
function namespacePrefixesOf(module: Record<string, unknown>): readonly string[] {
  return Object.entries(module)
    .filter(([name, value]) => name.endsWith('REQUIREMENT_KEY_NAMESPACE') && typeof value === 'string')
    .map(([, value]) => `${value as string}.`);
}

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

  // ★ THE NAMESPACE LIST IS READ OFF THE FORMAT PACKAGES, NOT ENUMERATED HERE. It used to be twelve literal
  // prefixes, and every format added broke it — a list that must be edited in lockstep with the catalog is a
  // second copy of the catalog. Each format package exports its own namespace constant, which is the identity
  // both its analyzer and its catalog rows build keys from, so sweeping those exports states the same fact
  // without keeping a copy of it.
  it('namespaces every kind by format, so two formats cannot claim one key', () => {
    const namespaces = [...new Set(NAMESPACE_MODULES.flatMap(([, module]) => namespacePrefixesOf(module)))].sort();
    const kinds = buildRequirementCatalogRows().map((row) => row.kind);
    for (const kind of kinds) {
      expect(
        namespaces.some((namespace) => kind.startsWith(namespace)),
        `${kind} is in no format's namespace`,
      ).toBe(true);
    }
    // Every namespace must be ACCOUNTED FOR, or the clause above passes vacuously for the formats that are
    // missing — which is precisely how a format silently drops out of the catalog. Accounted for means rows OR a
    // recorded decline: STL is a list of triangles with no separable family, so it has no rows by design and its
    // one feature is declared always-read in the dispositions instead. Demanding rows would make the honest
    // answer fail the gate, and demanding nothing would let a real drop through, so the disjunction is the
    // invariant — and `catalog-dispositions.test.ts` separately proves each declined feature is genuinely
    // unclaimed and carries a reason.
    const declinedNamespaces = new Set(ALWAYS_READ_FORMAT_FEATURES.map(({ namespace }) => `${namespace}.`));
    for (const namespace of namespaces) {
      expect(
        kinds.some((kind) => kind.startsWith(namespace)) || declinedNamespaces.has(namespace),
        `${namespace} has neither catalog rows nor a recorded decline`,
      ).toBe(true);
    }
    // And the sweep itself must have found something in every module, or BOTH loops above pass on an empty list —
    // which is what a namespace constant moving off the lane named here would look like.
    for (const [name, module] of NAMESPACE_MODULES) {
      expect(namespacePrefixesOf(module).length, name).toBeGreaterThan(0);
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
      const aliasCount = symbol === 'threeDsMaterialHandler' ? 1 : 0;
      expect(rows.filter((row) => row.implementationSymbol === symbol).length, symbol).toBe(
        handler.chunkIds.length + aliasCount,
      );
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
      // ★ A DIRECT-PARSER ROW NAMES A FUNCTION, AND THAT SATISFIES THE SAME INVARIANT. The property being
      // protected is that a row resolves to ONE implementation rather than a family — a bedrock format has no
      // handler family to be confused with, so its row names the parse function itself. Requiring a handler
      // SHAPE here would reject the one row kind that cannot possibly re-inflate a bundle.
      if (row.parserExport !== undefined) {
        expect(typeof value, `${row.implementationSymbol} is not a parse function`).toBe('function');
        continue;
      }
      expect(
        isTagHandler(value) ||
          isBlockHandler(value) ||
          isChunkHandler(value) ||
          isElementDecoder(value) ||
          isSectionHandler(value) ||
          isMaterialHandler(value) ||
          isSpineBinaryHandler(value) ||
          isSpineJsonHandler(value) ||
          isDragonBonesHandler(value) ||
          isLottieHandler(value) ||
          isGltfHandler(value) ||
          isFormatDescriptor(value) ||
          isSvgHandler(value),
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
    const aliasKind = `${THREE_DS_REQUIREMENT_KEY_NAMESPACE}.${getThreeDsChunkName(THREE_DS_MATERIAL_TEXTURE_MAP)}`;
    for (const [symbol, handler] of THREE_DS_CHUNK_HANDLERS) {
      const claimed = new Set(handler.chunkIds.map((chunkId) => `3ds.${getThreeDsChunkName(chunkId)}`));
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        if (row.kind === aliasKind) continue;
        expect(claimed.has(row.kind), `${symbol} does not claim ${row.kind}`).toBe(true);
      }
    }
  });

  it('keeps MaterialTextureMap out of dispatch IDs while resolving it to threeDsMaterialHandler', () => {
    const handler = THREE_DS_CHUNK_HANDLERS.get('threeDsMaterialHandler')!;
    expect(handler.chunkIds).not.toContain(THREE_DS_MATERIAL_TEXTURE_MAP);
    const aliasKind = `${THREE_DS_REQUIREMENT_KEY_NAMESPACE}.${getThreeDsChunkName(THREE_DS_MATERIAL_TEXTURE_MAP)}`;
    const rows = buildRequirementCatalogRows();
    const aliasRow = rows.find((row) => row.kind === aliasKind);
    expect(aliasRow, 'catalog row for MaterialTextureMap must exist').toBeDefined();
    expect(aliasRow!.implementationSymbol).toBe('threeDsMaterialHandler');
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

  // AWD2, glTF and SWF carry no position: their importers re-sort internally, so a number here would assert a
  // constraint the format does not actually have.
  it('leaves familyOrder absent for the formats whose importers re-sort internally', () => {
    for (const row of buildRequirementCatalogRows()) {
      // Rive joins AWD2 and SWF here for a different reason: its application order is fixed by
      // `applyRiveImportOptions` (kernel-dependent registrars first), not by the order rows are emitted in, so
      // a position on the row would assert a constraint the format does not have.
      // A direct-parser row joins them for the plainest reason of all: it names the only parser its format has,
      // so there is no family for a position to be a position IN.
      if (
        row.parserExport !== undefined ||
        row.kind.startsWith('awd2.') ||
        row.kind.startsWith('gltf.') ||
        row.kind.startsWith('riv.') ||
        row.kind.startsWith('swf.')
      ) {
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

  // ★ RIVE'S ROWS NAME A REGISTRAR, WHICH IS WHY THEY ARE DERIVED BY RUNNING ONE. Every other format's row
  // names a handler VALUE that declares what it claims; a Rive family is installed by calling a function, so
  // the only honest source for "which core types does this claim" is to apply it to a throwaway registry and
  // read the keys back. These guards check that derivation against the shipped registrars directly.
  it('derives one Rive row per core type each shipped registrar installs', () => {
    const rows = buildRequirementCatalogRows().filter((row) => row.kind.startsWith('riv.'));
    let expected = 0;
    for (const registrar of riveAllRegistrars) {
      const registry = createRiveImportRegistry();
      registrar(registry);
      expected += registry.handlers.size;
    }
    for (const registrar of riveAllPathBooleanRegistrars) {
      const registry = createRiveImportRegistry();
      registrar({} as never, registry);
      expected += registry.handlers.size;
    }
    expect(rows).toHaveLength(expected);
  });

  it('names the shipped registrar identity for every Rive row', () => {
    const shipped = new Set([...riveAllRegistrars, ...riveAllPathBooleanRegistrars].map((fn) => fn.name));
    for (const row of buildRequirementCatalogRows().filter((candidate) => candidate.kind.startsWith('riv.'))) {
      expect(shipped.has(row.implementationSymbol), row.implementationSymbol).toBe(true);
      expect((scene2dFormats as unknown as Record<string, unknown>)[row.implementationSymbol]).toBeTypeOf('function');
    }
  });

  // ★ THE DEPENDENCY SPLIT IS WHAT THE TWO FIELDS ARE FOR. A build that omits the clipping family must never
  // link a path-boolean implementation, and that only holds if the kernel-dependent registrar lands in its own
  // options field instead of the general one.
  it('routes the kernel-dependent Rive registrar to its own parser field', () => {
    const rows = buildRequirementCatalogRows().filter((row) => row.kind.startsWith('riv.'));
    const kernelNames = new Set(riveAllPathBooleanRegistrars.map((fn) => fn.name));
    for (const row of rows) {
      const expected = kernelNames.has(row.implementationSymbol) ? 'pathBooleanRegistrars' : 'registrars';
      expect(row.parserField, row.implementationSymbol).toBe(expected);
    }
    // Both fields must actually occur, or the split is asserted vacuously.
    expect(rows.some((row) => row.parserField === 'pathBooleanRegistrars')).toBe(true);
    expect(rows.some((row) => row.parserField === 'registrars')).toBe(true);
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

  it('lists every Lottie layer handler the scene2d-formats package exports', () => {
    const exported = Object.keys(scene2dFormats)
      .filter(
        (name) =>
          name.startsWith('lottie') &&
          name.endsWith('LayerHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (scene2dFormats as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(LOTTIE_LAYER_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('lists every Lottie shape item handler the scene2d-formats package exports', () => {
    const exported = Object.keys(scene2dFormats)
      .filter(
        (name) =>
          name.startsWith('lottie') &&
          name.endsWith('ShapeItemHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (scene2dFormats as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(LOTTIE_SHAPE_ITEM_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('emits one row per Lottie handler, each routed to its declared kind', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, , kind] of LOTTIE_LAYER_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`lottie.${kind}`);
    }
    for (const [symbol, , kind] of LOTTIE_SHAPE_ITEM_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`lottie.${kind}`);
    }
  });

  it('numbers each Lottie row by its position in the family the format ships', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of LOTTIE_LAYER_HANDLERS) {
      const expected = lottieAllLayerHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
    for (const [symbol, handler] of LOTTIE_SHAPE_ITEM_HANDLERS) {
      const expected = lottieAllShapeItemHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
  });

  // ★ THREE FAMILIES, NOT TWO. Masks became a family of their own because they belong to no layer kind, so a Lottie row
  // now routes to one of three registry fields. Deriving the field from the tables rather than from the kind's spelling
  // is what makes a row that drifts into the wrong family fail here.
  it('sets parserField on Lottie rows to route each handler to its own registry field', () => {
    const field = new Map<string, string>();
    for (const [, , kind] of LOTTIE_LAYER_HANDLERS) field.set(`lottie.${kind}`, 'layerHandlers');
    for (const [, , kind] of LOTTIE_MASK_HANDLERS) field.set(`lottie.${kind}`, 'maskHandlers');
    for (const [, , kind] of LOTTIE_SHAPE_ITEM_HANDLERS) field.set(`lottie.${kind}`, 'shapeItemHandlers');

    const rows = buildRequirementCatalogRows().filter((candidate) => candidate.kind.startsWith('lottie.'));
    expect(rows.length).toBe(field.size);
    for (const row of rows) expect(row.parserField, row.kind).toBe(field.get(row.kind));
  });

  it('lists every Lottie mask handler the scene2d-formats package exports', () => {
    const exported = Object.keys(scene2dFormats)
      .filter(
        (name) =>
          name.startsWith('lottie') &&
          name.endsWith('MaskHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (scene2dFormats as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(LOTTIE_MASK_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('imports Lottie handlers from the public lane', () => {
    for (const row of buildRequirementCatalogRows().filter((r) => r.kind.startsWith('lottie.'))) {
      expect(row.implementationImport).toBe('@flighthq/scene2d-formats');
    }
  });
  it('lists every SVG element handler the scene2d-formats package exports', () => {
    const exported = Object.keys(scene2dFormats)
      .filter(
        (name) =>
          name.startsWith('svg') &&
          name.endsWith('ElementHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (scene2dFormats as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(SVG_ELEMENT_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('emits one row per SVG handler, each routed to its declared kind', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, , kind] of SVG_ELEMENT_HANDLERS) {
      const matching = rows.filter((candidate) => candidate.implementationSymbol === symbol);
      expect(matching, symbol).toHaveLength(1);
      expect(matching[0].kind, symbol).toBe(`svg.${kind}`);
    }
  });

  it('numbers each SVG row by its position in the family the format ships', () => {
    const rows = buildRequirementCatalogRows();
    for (const [symbol, handler] of SVG_ELEMENT_HANDLERS) {
      const expected = svgAllElementHandlers.indexOf(handler);
      for (const row of rows.filter((candidate) => candidate.implementationSymbol === symbol)) {
        expect(row.familyOrder, symbol).toBe(expected);
      }
    }
  });
  // ★ TWO FAMILIES NOW, NOT ONE. Clipping became a family of its own because every element may carry `clip-path`, so an
  // SVG row routes to one of two registry fields. Deriving the field from the tables rather than from the kind's spelling
  // is what makes a row that drifts into the wrong family fail here.
  it('sets parserField on SVG rows to route each handler to its own registry field', () => {
    const field = new Map<string, string>();
    for (const [, , kind] of SVG_CLIP_HANDLERS) field.set(`svg.${kind}`, 'clipHandlers');
    for (const [, , kind] of SVG_ELEMENT_HANDLERS) field.set(`svg.${kind}`, 'elementHandlers');

    const rows = buildRequirementCatalogRows().filter((candidate) => candidate.kind.startsWith('svg.'));
    expect(rows.length).toBe(field.size);
    for (const row of rows) expect(row.parserField, row.kind).toBe(field.get(row.kind));
  });

  it('lists every SVG clip handler the scene2d-formats package exports', () => {
    const exported = Object.keys(scene2dFormats)
      .filter(
        (name) =>
          name.startsWith('svg') &&
          name.endsWith('ClipHandler') &&
          !name.startsWith('register') &&
          !name.startsWith('get') &&
          !name.startsWith('unregister') &&
          typeof (scene2dFormats as unknown as Record<string, unknown>)[name] === 'function',
      )
      .sort();
    expect(SVG_CLIP_HANDLERS.map(([symbol]) => symbol).sort()).toEqual(exported);
  });

  it('imports SVG handlers from the public lane', () => {
    for (const row of buildRequirementCatalogRows().filter((r) => r.kind.startsWith('svg.'))) {
      expect(row.implementationImport).toBe('@flighthq/scene2d-formats');
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

// A Rive family registrar: a FUNCTION that installs handlers, not a handler value. Rive is the one format whose
// rows name something to call, which is why its options seam exists.
function isRiveRegistrar(value: unknown): boolean {
  return typeof value === 'function';
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

function isLottieHandler(value: unknown): boolean {
  return typeof value === 'function';
}

function isGltfHandler(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'apply' in value &&
    typeof value.apply === 'function' &&
    'kind' in value &&
    typeof value.kind === 'string'
  );
}

function isFormatDescriptor(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'kind' in value &&
    ('codec' in value || 'entry' in value)
  );
}

function isSvgHandler(value: unknown): boolean {
  return typeof value === 'function';
}
