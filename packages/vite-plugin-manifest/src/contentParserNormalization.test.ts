import { parseBitmapFontBinary } from '@flighthq/bitmapfont-formats';
import { decodeUTF8, encodeUTF8 } from '@flighthq/encoding/contract';
import { parseStarlingPex } from '@flighthq/particles-formats';
import { BUILT_IN_REQUIREMENT_CATALOG_ENTRIES } from '@flighthq/requirement-catalog/contract';
import { parseTiledTmx } from '@flighthq/tilemap-formats';
import type { ImportDiagnostic } from '@flighthq/types/contract';

import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers.ts';
import { generateManifestModuleSource } from './manifestModuleSource.ts';

const NO_DECOMPRESSORS = { deflate: null, lzma: null };

// The nine direct-parser rows, and the calling convention each parser actually has. `contentParser` must present
// ONE convention — bytes first — regardless of which of these the build selected.
const DIRECT_ROWS: readonly (readonly [kind: string, parser: string, inputKind: 'bytes' | 'string'])[] = [
  ['bitmapfont.BmFontBinary', 'parseBitmapFontBinary', 'bytes'],
  ['bitmapfont.BmFontJson', 'parseBitmapFontJson', 'string'],
  ['bitmapfont.BmFontText', 'parseBitmapFontFnt', 'string'],
  ['bitmapfont.BmFontXml', 'parseBitmapFontXml', 'string'],
  ['particles.StarlingPex', 'parseStarlingPex', 'string'],
  ['tilemap.TiledTmj', 'parseTiledTmj', 'string'],
  ['tilemap.TiledTmx', 'parseTiledTmx', 'string'],
  ['tilemap.TiledTsj', 'parseTiledTilesetJson', 'string'],
  ['tilemap.TiledTsx', 'parseTiledTileset', 'string'],
];

const TMX = '<map width="1" height="1" tilewidth="8" tileheight="8"/>';
const PEX = '<particleEmitterConfig><maxParticles value="100"/></particleEmitterConfig>';
const FNT_BINARY = new Uint8Array([66, 77, 70, 3, 1, 0, 0, 0]);

describe('contentParser byte-input normalization', () => {
  it.each(DIRECT_ROWS)('states the input kind on the %s catalog row', (kind, parser, inputKind) => {
    const entry = BUILT_IN_REQUIREMENT_CATALOG_ENTRIES.find((row) => row.kind === kind);
    expect(entry, `no catalog row for ${kind}`).toBeDefined();
    expect(entry!.implementationSymbol).toBe(parser);
    // ★ STATED ON EVERY ROW, NOT DEFAULTED. The emitter falls back to bytes for a row that says nothing, which is
    // the right default for an unknown row and the wrong thing to rely on for a shipped one: a string parser that
    // silently inherited it would be handed a Uint8Array.
    expect(entry!.contentParserInputKind, `${kind} does not state its input kind`).toBe(inputKind);
  });

  // ★ EXECUTABLE, NOT PATTERN-MATCHED. The emitted binding is evaluated and CALLED with bytes, because the claim
  // is about a runtime contract: a test that only grepped the wrapper's text would pass on a wrapper that decoded
  // the wrong argument or dropped the rest.
  it('runs a string parser through the generated wrapper with bytes as the first argument', () => {
    const contentParser = evaluateBinding(generate('.tmx', encodeUTF8(TMX)), { decodeUTF8, parseTiledTmx });

    const map = contentParser(encodeUTF8(TMX)) as { width: number } | null;

    expect(map, 'the wrapper returned no map').not.toBeNull();
    expect(map!.width).toBe(1);
  });

  it('runs a bytes parser directly, with the same bytes-first contract', () => {
    const contentParser = evaluateBinding(generate('.fnt', FNT_BINARY), { parseBitmapFontBinary });

    // The binary front end rejects this stub after reading the header, so the sentinel is the observable: what
    // matters is that it received BYTES and answered, rather than being handed decoded text.
    expect(contentParser(FNT_BINARY)).toBeNull();
    expect(() => contentParser(FNT_BINARY)).not.toThrow();
  });

  // ★ THE REST ARGUMENTS ARE THE PARSER'S OWN API. Options and a diagnostics sink follow the first argument; a
  // wrapper that dropped them would leave a caller unable to collect diagnostics while the module looked right.
  it('forwards options and diagnostics in order to a string parser', () => {
    const contentParser = evaluateBinding(generate('.tmx', encodeUTF8(TMX)), { decodeUTF8, parseTiledTmx });
    const diagnostics: ImportDiagnostic[] = [];

    // A root of `tileset` is not a map, which is the fault parseTiledTmx reports into the third argument.
    const result = contentParser(encodeUTF8('<tileset name="t"/>'), undefined, diagnostics);

    expect(result).toBeNull();
    expect(diagnostics.map((entry) => entry.kind)).toContain('tiled.root-unexpected');
  });

  it('forwards an options argument a parser reads, rather than swallowing it', () => {
    const contentParser = evaluateBinding(generate('.pex', encodeUTF8(PEX)), { decodeUTF8, parseStarlingPex });

    // `textureSize` scales the emitter's sizes, so two calls differing only in the forwarded option must differ.
    const small = contentParser(encodeUTF8(PEX), { textureSize: 1 }) as Record<string, unknown>;
    const large = contentParser(encodeUTF8(PEX), { textureSize: 64 }) as Record<string, unknown>;

    expect(JSON.stringify(small)).not.toEqual(JSON.stringify(large));
  });

  it('decodes exactly once, from the public encoding lane, and only for a string parser', () => {
    const text = generate('.tmx', encodeUTF8(TMX));
    expect(text.match(/^import \{ decodeUTF8 \} from '@flighthq\/encoding';$/gm)).toHaveLength(1);
    expect(text).toContain('decodeUTF8(source)');

    const bytes = generate('.fnt', FNT_BINARY);
    expect(bytes.includes('decodeUTF8'), 'a bytes parser pulled in the decoder').toBe(false);
    expect(bytes.includes('@flighthq/encoding'), 'a bytes parser pulled in the encoding package').toBe(false);
  });

  it.each([
    ['.fnt', FNT_BINARY],
    ['.tmx', encodeUTF8(TMX)],
    ['.pex', encodeUTF8(PEX)],
  ])('keeps %s free of any registry, applier or full preset', (extension, bytes) => {
    const source = generate(extension, bytes);
    for (const forbidden of [
      'applyBitmapFontImportOptions',
      'applyTilemapImportOptions',
      'bitmapFontAllFormats',
      'tilemapAllMapFormats',
      'parseBitmapFont(',
      'detectBitmapFontFormat',
      '/contract',
    ]) {
      expect(source.includes(forbidden), `${extension} names ${forbidden}`).toBe(false);
    }
    expect(source).toContain('export const parserOptions = {};');
  });

  // ★ CONTRADICTORY METADATA IS A CONFLICT, NOT A COIN FLIP. The same parser under two input kinds would emit the
  // direct binding for one row and the decoding wrapper for the other; accepting either silently hands the parser
  // the wrong argument shape.
  it('reports a deterministic conflict when two rows disagree about the input kind', () => {
    const result = generateManifestModuleSource(
      [directRow('tilemap.TiledTmx', 'string'), directRow('tilemap.TiledTmxAgain', 'bytes')],
      '.tmx',
    );

    expect(result.source.match(/export const contentParser =/g)).toHaveLength(1);
    expect(result.source).toContain('(source, ...rest)');
    expect(result.problems).toEqual([
      'direct parser export contentParser already bound to parseTiledTmx from @flighthq/tilemap-formats (string):' +
        ' dropped tilemap.TiledTmxAgain (parseTiledTmx from @flighthq/tilemap-formats, bytes)',
    ]);
  });

  it('still deduplicates two rows that agree on every emitted fact', () => {
    const result = generateManifestModuleSource(
      [directRow('tilemap.TiledTmx', 'string'), directRow('tilemap.TiledTmxAgain', 'string')],
      '.tmx',
    );

    expect(result.source.match(/export const contentParser =/g)).toHaveLength(1);
    expect(result.source.match(/^import \{ decodeUTF8 \} from/gm)).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });
});

function directRow(kind: string, inputKind: 'bytes' | 'string') {
  return {
    entry: {
      backend: 'parser',
      contentParserInputKind: inputKind,
      facet: 'document.format' as never,
      implementationImport: '@flighthq/tilemap-formats',
      implementationSymbol: 'parseTiledTmx',
      kind,
      parserExport: 'contentParser',
    },
    kind,
  };
}

function generate(extension: string, bytes: Uint8Array): string {
  const set = DEFAULT_CONTENT_ANALYZERS[extension].analyze(bytes, NO_DECOMPRESSORS);
  const rows = set.requirements.map((requirement) => {
    const entry = BUILT_IN_REQUIREMENT_CATALOG_ENTRIES.find((row) => row.kind === requirement.key);
    if (entry === undefined) throw new Error(`no catalog row for ${requirement.key}`);
    return { entry, kind: requirement.key };
  });
  return generateManifestModuleSource(rows, extension).source;
}

// Evaluates the EMITTED binding expression verbatim, with the real parser and decoder in scope. The generated
// module is served as a Vite virtual module with no extension, so its source is plain JavaScript — which is
// exactly what this evaluates, syntax included. A wrapper carrying a type annotation would fail here the same
// way it would fail in a build.
function evaluateBinding(source: string, scope: Readonly<Record<string, unknown>>): (...args: never[]) => unknown {
  const match = /^export const contentParser = (.+);$/m.exec(source);
  if (match === null) throw new Error(`no contentParser binding in:\n${source}`);
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func -- the subject under test IS the emitted source text.
  const make = new Function(...names, `return (${match[1]});`) as (...args: unknown[]) => (...a: never[]) => unknown;
  return make(...names.map((name) => scope[name]));
}
