import type { TilemapFormatKind } from '@flighthq/types/contract';
import {
  TilemapFormatKindTiledTmj,
  TilemapFormatKindTiledTmx,
  TilemapFormatKindTiledTsj,
  TilemapFormatKindTiledTsx,
} from '@flighthq/types/contract';

import {
  applyTilemapImportOptions,
  detectTilemapFormat,
  getTilemapFormat,
  getTilemapFormatKinds,
  getTilesetFormat,
  getTilesetFormatKinds,
  parseTilemap,
  parseTileset,
  registerTilemapFormat,
  registerTilesetFormat,
  tiledTmjTilemapFormat,
  tiledTmxTilemapFormat,
  tiledTsjTilesetFormat,
  tiledTsxTilesetFormat,
  tilemapAllMapFormats,
  tilemapAllTilesetFormats,
  unregisterTilemapFormat,
  unregisterTilesetFormat,
} from './tilemapDetect.ts';

const TMX = `<?xml version="1.0" encoding="UTF-8"?>
<!-- authored by hand -->
<map version="1.10" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16">
 <tileset firstgid="1" source="tiles.tsx"/>
 <layer id="1" name="ground" width="2" height="2">
  <data encoding="csv">1,2,3,4</data>
 </layer>
</map>`;

const TSX = `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" name="tiles" tilewidth="16" tileheight="16" tilecount="4" columns="2">
 <image source="tiles.png" width="32" height="32"/>
</tileset>`;

const TMJ = JSON.stringify({
  height: 2,
  layers: [{ data: [1, 2, 3, 4], height: 2, id: 1, name: 'ground', type: 'tilelayer', width: 2 }],
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tileheight: 16,
  tilesets: [{ firstgid: 1, source: 'tiles.tsj' }],
  tilewidth: 16,
  type: 'map',
  version: '1.10',
  width: 2,
});

const TSJ = JSON.stringify({
  columns: 2,
  image: 'tiles.png',
  imageheight: 32,
  imagewidth: 32,
  name: 'tiles',
  tilecount: 4,
  tileheight: 16,
  tilewidth: 16,
  type: 'tileset',
  version: '1.10',
});

// A TMJ and a TSJ with Tiled's `type` field removed, which is what a hand-authored or generated document looks
// like. Nothing but the detector's structural fallback can tell these apart — the JSON front ends never read
// `type` at all.
const TMJ_WITHOUT_TYPE = JSON.stringify({
  height: 2,
  layers: [{ data: [1, 2, 3, 4], height: 2, name: 'ground', type: 'tilelayer', width: 2 }],
  tileheight: 16,
  tilewidth: 16,
  width: 2,
});

const TSJ_WITHOUT_TYPE = JSON.stringify({
  columns: 2,
  image: 'tiles.png',
  tilecount: 4,
  tileheight: 16,
  tilewidth: 16,
});

// One document per built-in format, reused by the exclusivity proof and the reverse-order proof: both are
// statements about the same corpus, and a second copy of it could drift from the first without failing either.
const CORPUS: readonly (readonly [TilemapFormatKind, string])[] = [
  [TilemapFormatKindTiledTmx, TMX],
  [TilemapFormatKindTiledTmj, TMJ],
  [TilemapFormatKindTiledTsx, TSX],
  [TilemapFormatKindTiledTsj, TSJ],
];

describe('applyTilemapImportOptions', () => {
  // The built-ins are already seeded by the time any test runs, because each registry seeds itself on first
  // access. So "installs only what you name" is shown on a custom kind; re-registering a built-in is
  // last-write-wins by design.
  it('installs a named map format and nothing else', () => {
    const kind = 'acme.SeamMap' as TilemapFormatKind;
    expect(getTilemapFormat(kind)).toBeNull();
    applyTilemapImportOptions({ mapFormats: [{ entry: { detect: () => false, parse: () => null }, kind }] });
    expect(getTilemapFormat(kind)).not.toBeNull();
    // The two roles are separate registries: a map format must not become resolvable as a tileset format.
    expect(getTilesetFormat(kind)).toBeNull();
    unregisterTilemapFormat(kind);
    expect(getTilemapFormat(kind)).toBeNull();
  });

  it('installs a named tileset format into the tileset registry alone', () => {
    const kind = 'acme.SeamTileset' as TilemapFormatKind;
    applyTilemapImportOptions({ tilesetFormats: [{ entry: { detect: () => false, parse: () => null }, kind }] });
    expect(getTilesetFormat(kind)).not.toBeNull();
    expect(getTilemapFormat(kind)).toBeNull();
    unregisterTilesetFormat(kind);
    expect(getTilesetFormat(kind)).toBeNull();
  });

  // ★ MEASURED AGAINST A KIND THAT IS ABSENT, because a before/after comparison of the kind set cannot see this
  // bug. Empty options falling back to the full preset would re-register kinds that are ALREADY installed, which
  // leaves the set identical — the comparison passes while the fallback is live.
  it('installs nothing for empty options, rather than falling back to the built-ins', () => {
    unregisterTilemapFormat(TilemapFormatKindTiledTmx);
    unregisterTilesetFormat(TilemapFormatKindTiledTsx);
    applyTilemapImportOptions({});
    expect(getTilemapFormat(TilemapFormatKindTiledTmx)).toBeNull();
    expect(getTilesetFormat(TilemapFormatKindTiledTsx)).toBeNull();
    applyTilemapImportOptions({
      mapFormats: [tiledTmxTilemapFormat],
      tilesetFormats: [tiledTsxTilesetFormat],
    });
    expect(getTilemapFormat(TilemapFormatKindTiledTmx)).toBe(tiledTmxTilemapFormat.entry);
    expect(getTilesetFormat(TilemapFormatKindTiledTsx)).toBe(tiledTsxTilesetFormat.entry);
  });
});

describe('detectTilemapFormat', () => {
  it('detects each built-in document as its own format', () => {
    for (const [expected, text] of CORPUS) {
      expect(detectTilemapFormat(text), expected).toBe(expected);
    }
  });

  // ★ THE INVARIANT A NAIVE DETECTOR GETS WRONG. Every TMX map carries `<tileset>` CHILDREN, so a TSX detector
  // that searched the text for that element would claim every map document. The root element is what separates
  // them, which is also the invariant the shipped parsers enforce.
  it('reads the root element, not any occurrence of it, so a map carrying tilesets is still a map', () => {
    expect(TMX).toContain('<tileset');
    expect(detectTilemapFormat(TMX)).toBe(TilemapFormatKindTiledTmx);
  });

  it('skips the declaration, a comment and a doctype before the root element', () => {
    const withDoctype = `<?xml version="1.0"?>\n<!DOCTYPE map SYSTEM "map.dtd">\n<!-- note -->\n<map width="1"></map>`;
    expect(detectTilemapFormat(withDoctype)).toBe(TilemapFormatKindTiledTmx);
  });

  it('falls back to structure for JSON that omits Tiled type, because the parsers never read it', () => {
    expect(detectTilemapFormat(TMJ_WITHOUT_TYPE)).toBe(TilemapFormatKindTiledTmj);
    expect(detectTilemapFormat(TSJ_WITHOUT_TYPE)).toBe(TilemapFormatKindTiledTsj);
  });

  // ★ THE FALLBACK MUST NOT CLAIM UNRELATED JSON. Answering "tileset" for any object without a `type` would put
  // a Tiled parser in the bundle of a build whose only JSON asset is a spritesheet or an app config.
  it('returns null for JSON that is not a Tiled document', () => {
    expect(detectTilemapFormat(JSON.stringify({ frames: {}, meta: { app: 'texturepacker' } }))).toBeNull();
    expect(detectTilemapFormat(JSON.stringify({ tileheight: 16, tilewidth: 16 }))).toBeNull();
    expect(detectTilemapFormat(JSON.stringify({ type: 'objecttemplate' }))).toBeNull();
    expect(detectTilemapFormat('[]')).toBeNull();
  });

  it('returns null for empty, malformed and non-Tiled input rather than throwing', () => {
    expect(detectTilemapFormat('')).toBeNull();
    expect(detectTilemapFormat('   \n ')).toBeNull();
    expect(detectTilemapFormat('{ not json')).toBeNull();
    expect(detectTilemapFormat('<svg></svg>')).toBeNull();
    expect(detectTilemapFormat('plain text')).toBeNull();
  });
});

describe('getTilemapFormat', () => {
  it('resolves a map kind and refuses a tileset kind', () => {
    expect(getTilemapFormat(TilemapFormatKindTiledTmj)).toBe(tiledTmjTilemapFormat.entry);
    expect(getTilemapFormat(TilemapFormatKindTiledTsj)).toBeNull();
  });
});

describe('getTilemapFormatKinds', () => {
  it('names the built-in map kinds and stops naming one after it is unregistered', () => {
    expect([...getTilemapFormatKinds()].sort()).toEqual([TilemapFormatKindTiledTmj, TilemapFormatKindTiledTmx].sort());
    const kind = 'acme.Enumerated' as TilemapFormatKind;
    registerTilemapFormat(kind, { detect: () => false, parse: () => null });
    expect(getTilemapFormatKinds()).toContain(kind);
    unregisterTilemapFormat(kind);
    expect(getTilemapFormatKinds()).not.toContain(kind);
  });
});

describe('getTilesetFormat', () => {
  it('resolves a tileset kind and refuses a map kind', () => {
    expect(getTilesetFormat(TilemapFormatKindTiledTsx)).toBe(tiledTsxTilesetFormat.entry);
    expect(getTilesetFormat(TilemapFormatKindTiledTmx)).toBeNull();
  });
});

describe('getTilesetFormatKinds', () => {
  it('names the built-in tileset kinds', () => {
    expect([...getTilesetFormatKinds()].sort()).toEqual([TilemapFormatKindTiledTsj, TilemapFormatKindTiledTsx].sort());
  });
});

describe('parseTilemap', () => {
  it('auto-detects and reads both map formats', () => {
    expect(parseTilemap(TMX)?.width).toBe(2);
    expect(parseTilemap(TMJ)?.width).toBe(2);
  });

  it('honours an explicit format kind', () => {
    expect(parseTilemap(TMJ, TilemapFormatKindTiledTmj)?.tileWidth).toBe(16);
  });

  // ★ A TILESET IS NOT A DEGENERATE MAP. Returning something for a TSX would hand the caller a map with no
  // layers and no size, which reads as a valid empty level rather than as the wrong document.
  it('returns null for a tileset document and for unrecognised text', () => {
    expect(parseTilemap(TSX)).toBeNull();
    expect(parseTilemap(TSJ)).toBeNull();
    expect(parseTilemap('plain text')).toBeNull();
  });
});

describe('parseTileset', () => {
  it('auto-detects and reads both tileset formats', () => {
    expect(parseTileset(TSX)?.tileWidth).toBe(16);
    expect(parseTileset(TSJ)?.tileWidth).toBe(16);
  });

  it('returns null for a map document and for unrecognised text', () => {
    expect(parseTileset(TMX)).toBeNull();
    expect(parseTileset(TMJ)).toBeNull();
    expect(parseTileset('')).toBeNull();
  });
});

describe('registerTilemapFormat', () => {
  it('makes a custom map format detectable and parseable', () => {
    const kind = 'acme.CustomMap' as TilemapFormatKind;
    registerTilemapFormat(kind, {
      detect: (text) => text.startsWith('ACMEMAP'),
      parse: () => parseTiledTmxFixture(),
    });
    expect(detectTilemapFormat('ACMEMAP v1')).toBe(kind);
    expect(parseTilemap('ACMEMAP v1')?.width).toBe(2);
    unregisterTilemapFormat(kind);
    expect(detectTilemapFormat('ACMEMAP v1')).toBeNull();
  });
});

describe('registerTilesetFormat', () => {
  it('makes a custom tileset format detectable and parseable', () => {
    const kind = 'acme.CustomTileset' as TilemapFormatKind;
    registerTilesetFormat(kind, {
      detect: (text) => text.startsWith('ACMETS'),
      parse: () => parseTileset(TSX),
    });
    expect(detectTilemapFormat('ACMETS v1')).toBe(kind);
    expect(parseTileset('ACMETS v1')?.tileWidth).toBe(16);
    unregisterTilesetFormat(kind);
    expect(detectTilemapFormat('ACMETS v1')).toBeNull();
  });
});

describe('tilemapAllMapFormats', () => {
  it('covers exactly the built-in map kinds the registry holds', () => {
    expect([...tilemapAllMapFormats.map((format) => format.kind)].sort()).toEqual([...getTilemapFormatKinds()].sort());
  });

  // A descriptor has to carry the SAME entry the registry resolved, or a catalog row naming a descriptor would
  // name an implementation the importer does not use.
  it('carries the entry identity the registry holds for each kind', () => {
    for (const format of tilemapAllMapFormats) {
      expect(getTilemapFormat(format.kind)).toBe(format.entry);
    }
  });
});

describe('tilemapAllTilesetFormats', () => {
  it('covers exactly the built-in tileset kinds the registry holds', () => {
    expect([...tilemapAllTilesetFormats.map((format) => format.kind)].sort()).toEqual(
      [...getTilesetFormatKinds()].sort(),
    );
  });

  it('carries the entry identity the registry holds for each kind', () => {
    for (const format of tilemapAllTilesetFormats) {
      expect(getTilesetFormat(format.kind)).toBe(format.entry);
    }
  });

  // ★ PRECEDENCE IS NOT LOAD-BEARING, PROVEN BY REVERSING IT rather than by reading the detectors. Exactly one
  // detector accepts each corpus document because all four ask ONE shared discrimination; this measures the
  // consequence a caller cares about — installing the presets backwards answers identically. Re-registering a
  // kind keeps its position, so the built-ins have to be REMOVED first or the reversed apply is a no-op and this
  // test passes without reordering anything.
  it('detects every corpus document identically when both presets are installed in reverse order', () => {
    const forward = CORPUS.map(([, text]) => detectTilemapFormat(text));
    expect(forward).toEqual(CORPUS.map(([kind]) => kind));

    removeBuiltIns();
    expect(getTilemapFormatKinds()).toEqual([]);
    expect(getTilesetFormatKinds()).toEqual([]);
    applyTilemapImportOptions({
      mapFormats: [...tilemapAllMapFormats].reverse(),
      tilesetFormats: [...tilemapAllTilesetFormats].reverse(),
    });
    expect(CORPUS.map(([, text]) => detectTilemapFormat(text))).toEqual(forward);

    removeBuiltIns();
    applyTilemapImportOptions({ mapFormats: tilemapAllMapFormats, tilesetFormats: tilemapAllTilesetFormats });
    expect(CORPUS.map(([, text]) => detectTilemapFormat(text))).toEqual(forward);
  });

  it('accepts each corpus document in exactly one of the two roles', () => {
    for (const [expected, text] of CORPUS) {
      const accepting = [
        ...tilemapAllMapFormats.map((format) => [format.kind, format.entry] as const),
        ...tilemapAllTilesetFormats.map((format) => [format.kind, format.entry] as const),
      ]
        .filter(([, entry]) => entry.detect(text))
        .map(([kind]) => kind);
      expect(accepting, text.slice(0, 40)).toEqual([expected]);
    }
  });
});

describe('unregisterTilemapFormat', () => {
  it('removes a map format from detection and resolution', () => {
    unregisterTilemapFormat(TilemapFormatKindTiledTmj);
    expect(detectTilemapFormat(TMJ)).toBeNull();
    expect(getTilemapFormat(TilemapFormatKindTiledTmj)).toBeNull();
    applyTilemapImportOptions({ mapFormats: [tiledTmjTilemapFormat] });
    expect(detectTilemapFormat(TMJ)).toBe(TilemapFormatKindTiledTmj);
  });
});

describe('unregisterTilesetFormat', () => {
  it('removes a tileset format from detection and resolution', () => {
    unregisterTilesetFormat(TilemapFormatKindTiledTsj);
    expect(detectTilemapFormat(TSJ)).toBeNull();
    applyTilemapImportOptions({ tilesetFormats: [tiledTsjTilesetFormat] });
    expect(detectTilemapFormat(TSJ)).toBe(TilemapFormatKindTiledTsj);
  });
});

function parseTiledTmxFixture(): ReturnType<typeof parseTilemap> {
  return parseTilemap(TMX, TilemapFormatKindTiledTmx);
}

function removeBuiltIns(): void {
  for (const format of tilemapAllMapFormats) unregisterTilemapFormat(format.kind);
  for (const format of tilemapAllTilesetFormats) unregisterTilesetFormat(format.kind);
}
