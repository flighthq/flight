import { encodeUTF8 } from '@flighthq/encoding/contract';
import { BUILT_IN_REQUIREMENT_CATALOG_ENTRIES } from '@flighthq/requirement-catalog/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers.ts';
import { generateManifestModuleSource } from './manifestModuleSource.ts';

const NO_DECOMPRESSORS = { deflate: null, lzma: null };

// One readable sample per bedrock extension, and the parser each must resolve to. These are the formats whose
// extension names ONE parser and which therefore have no handler family to subset — they are emitted as a flat
// `contentParser` binding rather than as a `parserOptions` field.
const BEDROCK: readonly (readonly [extension: string, sample: string, kind: string, parser: string])[] = [
  ['.fnt', 'info face="A" size=32\ncommon lineHeight=10\n', 'bitmapfont.BmFontText', 'parseBitmapFontFnt'],
  [
    '.pex',
    '<particleEmitterConfig><maxParticles value="100"/></particleEmitterConfig>',
    'particles.StarlingPex',
    'parseStarlingPex',
  ],
  ['.tmj', '{"height":1,"tileheight":8,"tilewidth":8,"width":1}', 'tilemap.TiledTmj', 'parseTiledTmj'],
  ['.tmx', '<map width="1" height="1" tilewidth="8" tileheight="8"/>', 'tilemap.TiledTmx', 'parseTiledTmx'],
  ['.tsj', '{"name":"t","tilewidth":8,"tileheight":8}', 'tilemap.TiledTsj', 'parseTiledTilesetJson'],
  ['.tsx', '<tileset name="t" tilewidth="8" tileheight="8"/>', 'tilemap.TiledTsx', 'parseTiledTileset'],
];

// ★ BMFont WRITES BINARY, TEXT AND XML ALL UNDER `.fnt`, so this extension is the reason the analyzer reads
// content instead of trusting the suffix. Each variant must reach its OWN parser; a coarse `.fnt` → text mapping
// would hand the XML and binary rows to `parseBitmapFontFnt`, which returns null on them.
const FNT_VARIANTS: readonly (readonly [label: string, bytes: Uint8Array, kind: string, parser: string])[] = [
  ['text', encodeUTF8('info face="A"\ncommon lineHeight=10\n'), 'bitmapfont.BmFontText', 'parseBitmapFontFnt'],
  ['xml', encodeUTF8('<font><common lineHeight="10"/></font>'), 'bitmapfont.BmFontXml', 'parseBitmapFontXml'],
  ['binary', new Uint8Array([66, 77, 70, 3, 1, 0, 0, 0]), 'bitmapfont.BmFontBinary', 'parseBitmapFontBinary'],
  ['json', encodeUTF8('{"common":{"lineHeight":10},"chars":[]}'), 'bitmapfont.BmFontJson', 'parseBitmapFontJson'],
];

describe('bedrock content analyzers', () => {
  it.each(BEDROCK)('emits exactly one document-format requirement for %s', (extension, sample, kind) => {
    const set = analyze(extension, encodeUTF8(sample));
    expect(set.requirements.map((requirement) => requirement.key)).toEqual([kind]);
    expect(set.requirements.map((requirement) => requirement.facet)).toEqual([RequirementFacet.DocumentFormat]);
  });

  it.each(BEDROCK)('reads %s as readable, and rejects content that is not that format', (extension, sample) => {
    expect(DEFAULT_CONTENT_ANALYZERS[extension].isReadable(encodeUTF8(sample), NO_DECOMPRESSORS)).toBe(true);
    // A different format's body under the same suffix is not readable AS this format, so it contributes nothing
    // rather than a requirement naming a parser that would reject it.
    expect(
      DEFAULT_CONTENT_ANALYZERS[extension].isReadable(encodeUTF8('not this format at all'), NO_DECOMPRESSORS),
    ).toBe(false);
    expect(analyze(extension, encodeUTF8('not this format at all')).requirements).toEqual([]);
  });

  it.each(BEDROCK)(
    'generates one direct parser binding and an empty parserOptions for %s',
    (extension, sample, kind, parser) => {
      const source = generate(extension, encodeUTF8(sample));
      expect(source).toContain(`export const contentParser = ${parser};`);
      // ★ NOT A parserOptions FIELD. These formats declare no handler field to spread into — TilemapImportOptions
      // has only the registry's descriptor lists, BitmapFontParseOptions has nothing — so a field here would either
      // install the registry or spread into nothing and parse with the full default family.
      expect(source).toContain('export const parserOptions = {};');
      expect(source).toContain(`import { ${parser} }`);
    },
  );

  // ★ THE POINT OF THE WHOLE EXERCISE. Naming one format must not drag in its siblings, which is what routing
  // through the detection registry did: measured at 40,377 bytes carrying five codecs against 7,935 for one.
  it.each(BEDROCK)('names no registry, applier or full preset for %s', (extension, sample, kind, parser) => {
    const source = generate(extension, encodeUTF8(sample));
    for (const forbidden of [
      'applyBitmapFontImportOptions',
      'applyTilemapImportOptions',
      'bitmapFontAllFormats',
      'tilemapAllMapFormats',
      'tilemapAllTilesetFormats',
      'registerBitmapFontFormat',
      'registerTilemapFormat',
      'parseBitmapFont(',
      'detectBitmapFontFormat',
    ]) {
      expect(source.includes(forbidden), `${extension} names ${forbidden}`).toBe(false);
    }
    // Exactly one parser import, so the selection is a selection rather than a family.
    const imported = [...source.matchAll(/^import \{ ([^}]+) \} from/gm)].flatMap((match) =>
      match[1].split(',').map((name) => name.trim()),
    );
    expect(imported).toEqual([parser]);
  });

  it.each(FNT_VARIANTS)('selects the %s parser for a .fnt carrying that form', (_label, bytes, kind, parser) => {
    expect(analyze('.fnt', bytes).requirements.map((requirement) => requirement.key)).toEqual([kind]);
    expect(generate('.fnt', bytes)).toContain(`export const contentParser = ${parser};`);
  });

  // ★ THE EXCLUSIONS, ASSERTED RATHER THAN DESCRIBED. Each of these names two or more parsers across different
  // families — `.plist` is Particle Designer particles AND Cocos plist spritesheets, `.atlas` is the libGDX
  // spritesheet AND the libGDX texture atlas, `.xml` is Starling spritesheet, Starling texture atlas and BMFont
  // XML — so no single direct binding is true for them and a union is not a bedrock selection.
  it.each(['.plist', '.atlas', '.xml'])('registers no analyzer for the ambiguous %s', (extension) => {
    expect(DEFAULT_CONTENT_ANALYZERS[extension]).toBeUndefined();
  });

  // An extension nobody wired is not an error: the plugin reports it and serves an empty module.
  it('leaves an unknown extension without an analyzer rather than throwing', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.nope']).toBeUndefined();
    expect(() => generateManifestModuleSource([], '.nope')).not.toThrow();
    expect(generateManifestModuleSource([], '.nope').source).toContain('export const parserOptions = {};');
  });

  // Every bedrock kind must have a catalog row, or the analyzer emits a requirement nothing can resolve and the
  // generated module silently selects no parser at all.
  it.each([...BEDROCK, ...FNT_VARIANTS.map((v) => ['.fnt', '', v[2], v[3]] as const)])(
    'has a direct-parser catalog row for %s %s %s',
    (_extension, _sample, kind, parser) => {
      const entry = BUILT_IN_REQUIREMENT_CATALOG_ENTRIES.find((row) => row.kind === kind);
      expect(entry, `no catalog row for ${kind}`).toBeDefined();
      expect(entry!.implementationSymbol).toBe(parser);
      expect(entry!.parserExport).toBe('contentParser');
      expect(entry!.parserField).toBeUndefined();
    },
  );
});

function analyze(
  extension: string,
  bytes: Uint8Array,
): ReturnType<(typeof DEFAULT_CONTENT_ANALYZERS)[string]['analyze']> {
  return DEFAULT_CONTENT_ANALYZERS[extension].analyze(bytes, NO_DECOMPRESSORS);
}

function generate(extension: string, bytes: Uint8Array): string {
  const rows = analyze(extension, bytes).requirements.map((requirement) => {
    const entry = BUILT_IN_REQUIREMENT_CATALOG_ENTRIES.find((row) => row.kind === requirement.key);
    if (entry === undefined) throw new Error(`no catalog row for ${requirement.key}`);
    return { entry, kind: requirement.key };
  });
  return generateManifestModuleSource(rows, extension).source;
}
