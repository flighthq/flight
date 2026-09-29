import {
  generateManifestModuleSource,
  MANIFEST_BACKEND_EXPORTS,
  MANIFEST_PARSER_BACKEND,
} from './manifestModuleSource.ts';

describe('generateManifestModuleSource', () => {
  it('exports every backend fragment plus parserOptions, even when a backend needs nothing', () => {
    const source = generateManifestModuleSource([row('gl', 'scene.node-kind', 'Shape')], '.swf').source;
    for (const name of ['canvasOptions', 'domOptions', 'glOptions', 'wgpuOptions', 'parserOptions']) {
      expect(source).toContain(`export const ${name} =`);
    }
    expect(source).toContain('export const canvasOptions = {};');
  });

  it('spreads a scene kind into the matching options field as a Map', () => {
    const source = generateManifestModuleSource([row('gl', 'scene.node-kind', 'Shape')], '.swf').source;
    expect(source).toContain('export const glOptions = {');
    expect(source).toContain('nodeRenderers: new Map([');
    expect(source).toContain("['Shape', glShapeImpl],");
  });

  it('writes a precise named import for every referenced symbol', () => {
    const source = generateManifestModuleSource(
      [row('gl', 'scene.node-kind', 'Shape'), row('wgpu', 'scene.material-kind', 'Standard')],
      '.swf',
    ).source;
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports).toEqual([
      "import { glShapeImpl } from '@acme/gl';",
      "import { wgpuStandardImpl } from '@acme/wgpu';",
    ]);
    expect(source).not.toContain('import *');
  });

  // CanvasRenderOptions and DomRenderOptions declare NO kind-keyed fields on base: canvas takes its
  // registries as a separate constructor parameter and DOM accepts none. So a row aimed at either is
  // reported rather than emitted into a field that does not exist. Pending an API ruling, this pins
  // what the plugin does today instead of pretending the fragment would spread.
  it.each(['canvas', 'dom', 'gl', 'wgpu'])('emits a nodeRenderers fragment for %s', (backend) => {
    const result = generateManifestModuleSource([row(backend, 'scene.node-kind', 'Shape')], '.swf');
    expect(result.source).toContain(`export const ${backend}Options = {\n  nodeRenderers: new Map([`);
    expect(result.problems).toEqual([]);
  });

  // The backend sets are NOT interchangeable, and these are the real differences on base.
  it('reports materialRenderers aimed at dom, which DomRenderOptions does not declare', () => {
    const result = generateManifestModuleSource([row('dom', 'scene.material-kind', 'Standard')], '.swf');
    expect(result.source).toContain('export const domOptions = {};');
    expect(result.problems).toEqual([
      'backend dom has no materialRenderers field: dropped scene.material-kind Standard',
    ]);
  });

  it('emits canvas blend mode as a scalar blendModeApplication field, not a Map', () => {
    const result = generateManifestModuleSource([row('canvas', 'scene.blend-mode', 'standard')], '.swf');
    expect(result.problems).toEqual([]);
    expect(result.source).toContain('blendModeApplication: canvasstandardImpl,');
  });

  // ★ THE FIELD NAME IS PER FORMAT. A `.dae` fragment emitted as `handlers` spreads into nothing, and
  // `parseCollada` then silently runs its full default family — a bigger bundle that behaves correctly,
  // which is the failure nobody notices.
  it('routes a 3DS row to handlers and a COLLADA row to decoders', () => {
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', '3ds.Trimesh')], '.3ds').source,
    ).toContain('export const parserOptions = {\n  handlers: [');
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', 'dae.Geometry')], '.dae').source,
    ).toContain('export const parserOptions = {\n  decoders: [');
  });

  // Rows arrive sorted by kind; `familyOrder` is what restores the order the format package ships. Stated
  // with the alphabetically LATER symbol given the earlier position, so a passing result cannot be the
  // arrival order agreeing by accident.
  it('orders parser rows by their family position rather than by the order they arrive', () => {
    const source = generateManifestModuleSource(
      [
        ordered(MANIFEST_PARSER_BACKEND, 'document.format', 'daeGeometry', 2),
        ordered(MANIFEST_PARSER_BACKEND, 'document.format', 'daeMaterial', 0),
      ],
      '.dae',
    ).source;
    expect(source).toContain(
      'export const parserOptions = {\n  decoders: [\n    parserdaeMaterialImpl,\n    parserdaeGeometryImpl,',
    );
  });

  // A format whose importer re-sorts internally carries no position, and those rows must not be shuffled
  // into some arbitrary order just because the sort runs.
  it('leaves rows carrying no family position in the order they arrived', () => {
    const source = generateManifestModuleSource(
      [
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'Zeta'),
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'Alpha'),
      ],
      '.awd2',
    ).source;
    expect(source).toContain('  blocks: [\n    parserZetaImpl,\n    parserAlphaImpl,');
  });

  it('keeps rows sharing one family position in arrival order, so output stays deterministic', () => {
    const source = generateManifestModuleSource(
      [
        ordered(MANIFEST_PARSER_BACKEND, 'document.format', 'daeSecond', 1),
        ordered(MANIFEST_PARSER_BACKEND, 'document.format', 'daeFirst', 1),
      ],
      '.dae',
    ).source;
    expect(source).toContain('  decoders: [\n    parserdaeSecondImpl,\n    parserdaeFirstImpl,');
  });

  it('keeps each backend in its own fragment', () => {
    const source = generateManifestModuleSource(
      [row('gl', 'scene.node-kind', 'Shape'), row('wgpu', 'scene.node-kind', 'Shape')],
      '.swf',
    ).source;
    expect(source).toContain("export const glOptions = {\n  nodeRenderers: new Map([\n    ['Shape', glShapeImpl],");
    expect(source).toContain("export const wgpuOptions = {\n  nodeRenderers: new Map([\n    ['Shape', wgpuShapeImpl],");
  });

  it('routes parser-backend rows to parserOptions under the format\u2019s own field', () => {
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', 'DefineShape')], '.swf').source,
    ).toContain('export const parserOptions = {\n  tags: [');
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', 'Camera')], '.awd2').source,
    ).toContain('export const parserOptions = {\n  blocks: [');
  });

  it('sends the same facet to a render fragment or to the parser by the row\u2019s backend', () => {
    const source = generateManifestModuleSource(
      [row(MANIFEST_PARSER_BACKEND, 'document.format', 'DefineShape'), row('gl', 'document.format', 'DefineShape')],
      '.swf',
    ).source;
    expect(source).toContain('export const parserOptions = {\n  tags: [\n    parserDefineShapeImpl,');
    expect(source).toContain(
      "export const glOptions = {\n  nodeRenderers: new Map([\n    ['DefineShape', glDefineShapeImpl],",
    );
  });

  it('preserves catalog order for handlers, because a handler list is ordered', () => {
    const source = generateManifestModuleSource(
      [
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'Second'),
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'First'),
      ],
      '.swf',
    ).source;
    // Measured inside the fragment: the import lines above it are sorted, so a whole-file indexOf
    // would be testing the import order instead of the handler order.
    const fragment = source.slice(source.indexOf('export const parserOptions'));
    expect(fragment.indexOf('parserSecondImpl')).toBeLessThan(fragment.indexOf('parserFirstImpl'));
  });

  it('sorts map entries by kind so the same rows always emit the same bytes', () => {
    const a = row('gl', 'scene.node-kind', 'Alpha');
    const b = row('gl', 'scene.node-kind', 'Beta');
    expect(generateManifestModuleSource([a, b], '.swf').source).toBe(
      generateManifestModuleSource([b, a], '.swf').source,
    );
  });

  it('REPORTS an unmapped facet rather than skipping it silently', () => {
    const result = generateManifestModuleSource([row('gl', 'compression.kind', 'Deflate')], '.swf');
    expect(result.source).toContain('export const glOptions = {};');
    expect(result.source).not.toContain('glDeflateImpl');
    expect(result.problems).toEqual([
      'facet compression.kind has no render-state options field: dropped Deflate for gl',
    ]);
  });

  it.each(['compression.kind', 'physics2d.joint-kind', 'scene.resource-mime-type'])(
    'reports %s, the facets with no render-state field',
    (facet) => {
      const result = generateManifestModuleSource([row('gl', facet, 'Thing')], '.swf');
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]).toContain(facet);
    },
  );

  it('does not leak a GL-only field into wgpu, and says so', () => {
    const result = generateManifestModuleSource(
      [row('gl', 'scene.blend-mode', 'Multiply'), row('wgpu', 'scene.blend-mode', 'Multiply')],
      '.swf',
    );
    expect(result.source).toContain('export const glOptions = {\n  blendRealizations: new Map([');
    expect(result.source).toContain('export const wgpuOptions = {};');
    expect(result.problems).toEqual(['backend wgpu has no blendRealizations field: dropped scene.blend-mode Multiply']);
    expect(result.source).not.toContain('wgpuMultiplyImpl');
  });

  it('reports a row naming a backend it does not know', () => {
    const result = generateManifestModuleSource([row('metal', 'scene.node-kind', 'Shape')], '.swf');
    expect(result.problems).toEqual(['unknown backend metal: dropped scene.node-kind Shape']);
  });

  it('emits a valid module with no imports when nothing resolved', () => {
    const source = generateManifestModuleSource([], '.swf').source;
    expect(source).not.toContain('import ');
    expect(source).toContain('export const parserOptions = {};');
  });

  it('deduplicates parser rows sharing one implementationSymbol within a field group', () => {
    const source = generateManifestModuleSource(
      [
        rowWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'KindA', 'sharedImpl'),
        rowWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'KindB', 'sharedImpl'),
      ],
      '.swf',
    ).source;
    const fragment = source.slice(source.indexOf('export const parserOptions'));
    const occurrences = fragment.split('sharedImpl').length - 1;
    expect(occurrences).toBe(1);
  });

  it('keeps the first family-order position when deduplicating parser symbols', () => {
    const source = generateManifestModuleSource(
      [
        orderedWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'KindLate', 'sharedImpl', 5),
        orderedWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'KindEarly', 'sharedImpl', 1),
        orderedWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'KindMiddle', 'otherImpl', 3),
      ],
      '.dae',
    ).source;
    const fragment = source.slice(source.indexOf('export const parserOptions'));
    expect(fragment).toContain('sharedImpl');
    expect(fragment).toContain('otherImpl');
    expect(fragment.indexOf('sharedImpl')).toBeLessThan(fragment.indexOf('otherImpl'));
  });

  it('retains order of distinct implementations after deduplication', () => {
    const source = generateManifestModuleSource(
      [
        orderedWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'A', 'alphaImpl', 0),
        orderedWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'B', 'betaImpl', 1),
        orderedWithSymbol(MANIFEST_PARSER_BACKEND, 'document.format', 'C', 'alphaImpl', 2),
      ],
      '.dae',
    ).source;
    const fragment = source.slice(source.indexOf('export const parserOptions'));
    expect(fragment.indexOf('alphaImpl')).toBeLessThan(fragment.indexOf('betaImpl'));
    expect(fragment.split('alphaImpl').length - 1).toBe(1);
  });

  it('does not deduplicate across different parser fields', () => {
    const source = generateManifestModuleSource(
      [
        rowWithSymbolAndField(MANIFEST_PARSER_BACKEND, 'document.format', 'KindA', 'sharedImpl', 'decoders'),
        rowWithSymbolAndField(MANIFEST_PARSER_BACKEND, 'document.format', 'KindB', 'sharedImpl', 'handlers'),
      ],
      '.swf',
    ).source;
    const fragment = source.slice(source.indexOf('export const parserOptions'));
    const occurrences = fragment.split('sharedImpl').length - 1;
    expect(occurrences).toBe(2);
  });
});

describe('generateManifestModuleSource direct parser rows', () => {
  // ★ A DIRECT-PARSER ROW NAMES A PARSE FUNCTION, NOT A HANDLER TO SPREAD. It becomes a flat binding and must
  // stay out of `parserOptions`: the formats that carry these rows declare no handler field, so a field would
  // either install their detection registry or spread into nothing and parse with the full default family.
  it('emits a flat binding and leaves parserOptions empty', () => {
    const result = generateManifestModuleSource([directRow('tilemap.TiledTmx', 'parseTiledTmx')], '.tmx');

    expect(result.source).toContain('export const contentParser = parseTiledTmx;');
    expect(result.source).toContain('export const parserOptions = {};');
    expect(result.problems).toEqual([]);
  });

  // Two requirements resolving to the SAME parser is ordinary, and emitting the binding twice would not compile.
  it('deduplicates identical bindings rather than emitting the name twice', () => {
    const result = generateManifestModuleSource(
      [directRow('tilemap.TiledTmx', 'parseTiledTmx'), directRow('tilemap.TiledTmxAgain', 'parseTiledTmx')],
      '.tmx',
    );

    expect(result.source.match(/export const contentParser =/g)).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  // ★ TWO DIFFERENT SYMBOLS UNDER ONE NAME IS A REPORTED PROBLEM, NOT A LAST-WRITE-WINS. It means analysis
  // decided the file is two formats at once; picking either would be a guess the build could not see.
  it('reports a deterministic problem when one export name resolves to two symbols', () => {
    const result = generateManifestModuleSource(
      [
        directRow('bitmapfont.BmFontText', 'parseBitmapFontFnt'),
        directRow('bitmapfont.BmFontXml', 'parseBitmapFontXml'),
      ],
      '.fnt',
    );

    expect(result.source.match(/export const contentParser =/g)).toHaveLength(1);
    expect(result.source).toContain('export const contentParser = parseBitmapFontFnt;');
    expect(result.problems).toEqual([
      'direct parser export contentParser already bound to parseBitmapFontFnt from @acme/parser (bytes): dropped bitmapfont.BmFontXml (parseBitmapFontXml from @acme/parser, bytes)',
    ]);
  });

  // ★ THE DROPPED PARSER MUST NOT LEAVE ITS IMPORT BEHIND. Importing every parser row before resolving the
  // conflict put the loser's import in the module anyway — an unused binding pulling a codec the build never
  // calls, which is the opposite of what selecting one parser is for.
  it('imports only the accepted binding, never the dropped one', () => {
    const result = generateManifestModuleSource(
      [
        directRow('bitmapfont.BmFontText', 'parseBitmapFontFnt'),
        directRow('bitmapfont.BmFontXml', 'parseBitmapFontXml'),
      ],
      '.fnt',
    );

    expect(result.source).toContain('parseBitmapFontFnt');
    expect(result.source.includes('parseBitmapFontXml'), 'dropped parser is still imported').toBe(false);
  });

  // ★ THE SAME SYMBOL NAME FROM TWO MODULES IS NOT THE SAME PARSER. Keying the identity on the symbol alone
  // called these identical, deduplicated them to one binding, and still imported both modules — so the
  // generated module declared one local name twice and did not compile. The identity is the module/symbol PAIR.
  it('treats one symbol name from two modules as a conflict, not a duplicate', () => {
    const result = generateManifestModuleSource(
      [
        directRowFrom('tilemap.TiledTmx', 'parseTiled', '@flighthq/tilemap-formats'),
        directRowFrom('particles.StarlingPex', 'parseTiled', '@flighthq/particles-formats'),
      ],
      '.tmx',
    );

    expect(result.source.match(/export const contentParser =/g)).toHaveLength(1);
    expect(result.problems).toEqual([
      'direct parser export contentParser already bound to parseTiled from @flighthq/tilemap-formats (bytes): dropped particles.StarlingPex (parseTiled from @flighthq/particles-formats, bytes)',
    ]);
    // One import line, from the accepted module only — the defect emitted both and declared the name twice.
    expect(result.source.match(/^import \{ parseTiled \} from/gm)).toHaveLength(1);
    expect(result.source).toContain("import { parseTiled } from '@flighthq/tilemap-formats';");
    expect(result.source.includes('@flighthq/particles-formats'), 'dropped module is still imported').toBe(false);
  });

  // And the same pair twice is still an ordinary duplicate: one binding, one import, no problem.
  it('deduplicates an identical module and symbol pair without reporting', () => {
    const result = generateManifestModuleSource(
      [
        directRowFrom('tilemap.TiledTmx', 'parseTiledTmx', '@flighthq/tilemap-formats'),
        directRowFrom('tilemap.TiledTmxAgain', 'parseTiledTmx', '@flighthq/tilemap-formats'),
      ],
      '.tmx',
    );

    expect(result.source.match(/export const contentParser =/g)).toHaveLength(1);
    expect(result.source.match(/^import \{ parseTiledTmx \} from/gm)).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  // An ordinary handler row alongside a direct row keeps its field; the two lanes do not contaminate each other.
  it('leaves ordinary handler rows in parserOptions unchanged', () => {
    const result = generateManifestModuleSource(
      [
        directRow('tilemap.TiledTmx', 'parseTiledTmx'),
        rowWithSymbol('parser', 'document.format', 'dae.Geometry', 'colladaGeometryDecoder'),
      ],
      '.dae',
    );

    expect(result.source).toContain('export const contentParser = parseTiledTmx;');
    expect(result.source).toContain('colladaGeometryDecoder,');
    expect(result.source).not.toContain('parserOptions = {};');
  });
});

describe('MANIFEST_BACKEND_EXPORTS', () => {
  it('names one flat export per backend', () => {
    expect(MANIFEST_BACKEND_EXPORTS).toEqual({
      canvas: 'canvasOptions',
      dom: 'domOptions',
      gl: 'glOptions',
      wgpu: 'wgpuOptions',
    });
  });
});

function ordered(backend: string, facet: string, kind: string, familyOrder: number) {
  const base = row(backend, facet, kind);
  return { ...base, entry: { ...base.entry, familyOrder } };
}

function row(backend: string, facet: string, kind: string) {
  const symbol = `${backend}${kind}Impl`;
  return {
    entry: {
      backend,
      facet: facet as never,
      implementationImport: `@acme/${backend}`,
      implementationSymbol: symbol,
      kind,
      registrarImport: `@acme/${backend}`,
      registrarSymbol: `register${kind}`,
    },
    kind,
  };
}

function rowWithSymbol(backend: string, facet: string, kind: string, symbol: string) {
  const base = row(backend, facet, kind);
  return { ...base, entry: { ...base.entry, implementationSymbol: symbol } };
}

function orderedWithSymbol(backend: string, facet: string, kind: string, symbol: string, familyOrder: number) {
  const base = rowWithSymbol(backend, facet, kind, symbol);
  return { ...base, entry: { ...base.entry, familyOrder } };
}

function rowWithSymbolAndField(backend: string, facet: string, kind: string, symbol: string, parserField: string) {
  const base = rowWithSymbol(backend, facet, kind, symbol);
  return { ...base, entry: { ...base.entry, parserField } };
}

function directRow(kind: string, symbol: string) {
  const base = rowWithSymbol('parser', 'document.format', kind, symbol);
  return { ...base, entry: { ...base.entry, parserExport: 'contentParser' } };
}

function directRowFrom(kind: string, symbol: string, module: string) {
  const base = directRow(kind, symbol);
  return { ...base, entry: { ...base.entry, implementationImport: module } };
}
