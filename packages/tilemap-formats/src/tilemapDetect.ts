import { getKindMapKeys, withKindMapEntry, withoutKindMapEntry } from '@flighthq/registry/contract';
import type {
  ImportDiagnostic,
  Kind,
  TiledMap,
  TiledParseOptions,
  TiledTileset,
  TilemapFormatDescriptor,
  TilemapFormatEntry,
  TilemapFormatKind,
  TilemapImportOptions,
  TilesetFormatDescriptor,
  TilesetFormatEntry,
} from '@flighthq/types/contract';
import {
  TilemapFormatKindTiledTmj,
  TilemapFormatKindTiledTmx,
  TilemapFormatKindTiledTsj,
  TilemapFormatKindTiledTsx,
} from '@flighthq/types/contract';

import { parseTiledTilesetJson, parseTiledTmj } from './tiledJsonParse.ts';
import { parseTiledTileset, parseTiledTmx } from './tiledXmlParse.ts';

/**
 * Installs the formats named in `options` into the two registries.
 *
 * ★ THE SEAM IS EXPLICIT AND NOTHING REGISTERS ON IMPORT. This package declares `"sideEffects": false`, so the
 * built-ins are seeded by each registry's own initializer rather than by parser modules registering themselves —
 * and options stay inert data a caller applies when they choose.
 *
 * Re-registering a kind is last-write-wins. Detection does not depend on registration order: every built-in
 * detector asks one shared discrimination and answers only for its own kind.
 */
export function applyTilemapImportOptions(options: Readonly<TilemapImportOptions>): void {
  for (const format of options.mapFormats ?? []) bindTilemapFormat(format.kind, format.entry);
  for (const format of options.tilesetFormats ?? []) bindTilesetFormat(format.kind, format.entry);
}

/** Sniff the text of a tilemap-domain document and return its format kind, or `null` when no registered
 *  format recognises it.
 *
 *  Detection is structural, not extension-based, and spans BOTH roles: a file on disk is a map or a tileset and
 *  the caller analysing it does not know which, so one question answers for all four built-in formats. Use
 *  `getTilemapFormat` / `getTilesetFormat` to learn which role the answer belongs to.
 *
 *  Returns `null` for unknown or corrupt input — never throws. */
export function detectTilemapFormat(text: string): TilemapFormatKind | null {
  if (typeof text !== 'string') return null;
  for (const [kind, entry] of getTilemapRegistry()) {
    if (entry.detect(text)) return kind;
  }
  for (const [kind, entry] of getTilesetRegistry()) {
    if (entry.detect(text)) return kind;
  }
  return null;
}

/** Retrieve the registered map entry for a `TilemapFormatKind`, or `null` when none is registered.
 *
 *  Returns `null` for a tileset kind: the two roles are separate registries because they produce different
 *  types, and which getter answers is how a caller learns the role of a detected kind. */
export function getTilemapFormat(kind: TilemapFormatKind): Readonly<TilemapFormatEntry> | null {
  return getTilemapRegistry().get(kind) ?? null;
}

/** Return a sorted snapshot of every bound map format kind. */
export function getTilemapFormatKinds(): readonly TilemapFormatKind[] {
  const kinds: TilemapFormatKind[] = [];
  getKindMapKeys(kinds, getTilemapRegistry());
  return kinds;
}

/** Retrieve the registered tileset entry for a `TilemapFormatKind`, or `null` when none is registered. */
export function getTilesetFormat(kind: TilemapFormatKind): Readonly<TilesetFormatEntry> | null {
  return getTilesetRegistry().get(kind) ?? null;
}

/** Return a sorted snapshot of every bound tileset format kind. */
export function getTilesetFormatKinds(): readonly TilemapFormatKind[] {
  const kinds: TilemapFormatKind[] = [];
  getKindMapKeys(kinds, getTilesetRegistry());
  return kinds;
}

/** Parse a tilemap document into a `TiledMap`, auto-detecting the format.
 *
 *  Pass `formatKind` to skip detection when the format is already known. Returns `null` when the text is not a
 *  recognised MAP document — including when it is a recognised TILESET, which `parseTileset` reads instead. */
export function parseTilemap(
  text: string,
  formatKind?: TilemapFormatKind,
  options?: Readonly<TiledParseOptions>,
  diagnostics?: ImportDiagnostic[],
): TiledMap | null {
  const kind = formatKind ?? detectTilemapFormat(text);
  if (kind === null || kind === undefined) return null;
  return getTilemapFormat(kind)?.parse(text, options, diagnostics) ?? null;
}

/** Parse a standalone tileset document into a `TiledTileset`, auto-detecting the format.
 *
 *  Returns `null` when the text is not a recognised TILESET document — including when it is a recognised map. */
export function parseTileset(
  text: string,
  formatKind?: TilemapFormatKind,
  options?: Readonly<TiledParseOptions>,
  diagnostics?: ImportDiagnostic[],
): TiledTileset | null {
  const kind = formatKind ?? detectTilemapFormat(text);
  if (kind === null || kind === undefined) return null;
  return getTilesetFormat(kind)?.parse(text, options, diagnostics) ?? null;
}

/** Register a custom map format for `detectTilemapFormat` and `parseTilemap`.
 *
 *  Last-write-wins: registering a built-in kind replaces it. Third-party formats should use a vendor-prefixed
 *  kind (e.g. `'acme.MyTilemap'`) so they cannot collide with a built-in. */
export function registerTilemapFormat(kind: TilemapFormatKind, entry: TilemapFormatEntry): void {
  bindTilemapFormat(kind, entry);
}

/** Register a custom tileset format for `detectTilemapFormat` and `parseTileset`. */
export function registerTilesetFormat(kind: TilemapFormatKind, entry: TilesetFormatEntry): void {
  bindTilesetFormat(kind, entry);
}

export const tiledTmxTilemapFormat: Readonly<TilemapFormatDescriptor> = {
  entry: {
    detect: (text) => readTilemapFormatKind(text) === TilemapFormatKindTiledTmx,
    parse: (text, options, diagnostics) => parseTiledTmx(text, options, diagnostics),
  },
  kind: TilemapFormatKindTiledTmx,
};

export const tiledTmjTilemapFormat: Readonly<TilemapFormatDescriptor> = {
  entry: {
    detect: (text) => readTilemapFormatKind(text) === TilemapFormatKindTiledTmj,
    parse: (text, options, diagnostics) => parseTiledTmj(text, options, diagnostics),
  },
  kind: TilemapFormatKindTiledTmj,
};

export const tiledTsxTilesetFormat: Readonly<TilesetFormatDescriptor> = {
  entry: {
    detect: (text) => readTilemapFormatKind(text) === TilemapFormatKindTiledTsx,
    parse: (text, options, diagnostics) => parseTiledTileset(text, options, diagnostics),
  },
  kind: TilemapFormatKindTiledTsx,
};

export const tiledTsjTilesetFormat: Readonly<TilesetFormatDescriptor> = {
  entry: {
    detect: (text) => readTilemapFormatKind(text) === TilemapFormatKindTiledTsj,
    parse: (text, options, diagnostics) => parseTiledTilesetJson(text, options, diagnostics),
  },
  kind: TilemapFormatKindTiledTsj,
};

/** Every built-in map format. Order is not load-bearing; the detectors are mutually exclusive. */
export const tilemapAllMapFormats: readonly Readonly<TilemapFormatDescriptor>[] = [
  tiledTmjTilemapFormat,
  tiledTmxTilemapFormat,
];

/** Every built-in tileset format. Order is not load-bearing; the detectors are mutually exclusive. */
export const tilemapAllTilesetFormats: readonly Readonly<TilesetFormatDescriptor>[] = [
  tiledTsjTilesetFormat,
  tiledTsxTilesetFormat,
];

/** Remove a map format binding, including a caller override of a built-in kind. */
export function unregisterTilemapFormat(kind: TilemapFormatKind): void {
  _tilemapRegistry = withoutKindMapEntry(getTilemapRegistry(), kind);
}

/** Remove a tileset format binding, including a caller override of a built-in kind. */
export function unregisterTilesetFormat(kind: TilemapFormatKind): void {
  _tilesetRegistry = withoutKindMapEntry(getTilesetRegistry(), kind);
}

function bindTilemapFormat(kind: TilemapFormatKind, entry: TilemapFormatEntry): void {
  _tilemapRegistry = withKindMapEntry(getTilemapRegistry(), kind, entry);
}

function bindTilesetFormat(kind: TilemapFormatKind, entry: TilesetFormatEntry): void {
  _tilesetRegistry = withKindMapEntry(getTilesetRegistry(), kind, entry);
}

// Seeded from the full presets, so the built-in set lives in exactly one place instead of being stated here and
// restated by anyone assembling the same set. Built-ins are seeded here rather than self-registering from their
// own modules on import: this package declares `"sideEffects": false`, so a top-level `registerTilemapFormat`
// call in each parser would be the import-time side effect the SDK bans, and it would drag every front-end into
// any consumer that imported one.
function getTilemapRegistry(): ReadonlyMap<Kind, TilemapFormatEntry> {
  if (_tilemapRegistry !== null) return _tilemapRegistry;
  _tilemapRegistry = new Map();
  applyTilemapImportOptions({ mapFormats: tilemapAllMapFormats });
  return _tilemapRegistry;
}

function getTilesetRegistry(): ReadonlyMap<Kind, TilesetFormatEntry> {
  if (_tilesetRegistry !== null) return _tilesetRegistry;
  _tilesetRegistry = new Map();
  applyTilemapImportOptions({ tilesetFormats: tilemapAllTilesetFormats });
  return _tilesetRegistry;
}

/**
 * The ONE discrimination all four built-in detectors ask, which is what makes them mutually exclusive.
 *
 * Each detector compares this answer against its own kind, so exactly one can be true for any document and none
 * of them is a broad net another has to be registered ahead of. Writing four independent predicates is what
 * would reintroduce precedence: `<tileset` appears inside every TMX map, so a TSX detector that merely LOOKED
 * for that string would claim every map document.
 *
 * XML is discriminated by ROOT ELEMENT NAME, which is the invariant the shipped parsers enforce —
 * `parseTiledTmx` rejects a root that is not `<map>` and `parseTiledTileset` rejects a root that is not
 * `<tileset>` — so a detector and its parser cannot disagree about which role a document has.
 *
 * ★ THE ROOT NAME IS SCANNED, NOT PARSED, so analysis never links the XML parser. Detection runs over every
 * candidate asset in a build and a TMX map is the one document here that is routinely megabytes; a full
 * `parseXmlDocument` per detector would parse the same document once per registered format. The cost of the
 * scan is that a MALFORMED document still looks like its root element — detection is a sniff, and the parser
 * is what validates and returns `null`.
 *
 * JSON is discriminated by Tiled's own `type` field, falling back to structure for a document that omits it.
 * The fallback is needed because the JSON front ends are permissive: neither reads `type`, so nothing but this
 * function tells a hand-written TMJ from a TSJ. `layers` decides between the two, which keeps the answers
 * exclusive — a tileset document has no layers — and the tile-size fields are required first so that arbitrary
 * JSON is answered `null` rather than claimed as a tileset.
 */
function readTilemapFormatKind(text: string): TilemapFormatKind | null {
  const trimmed = text.trimStart();
  if (trimmed === '') return null;
  if (trimmed.startsWith('<')) {
    const root = readXmlRootElementName(trimmed);
    if (root === 'map') return TilemapFormatKindTiledTmx;
    if (root === 'tileset') return TilemapFormatKindTiledTsx;
    return null;
  }
  if (!trimmed.startsWith('{')) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as {
    image?: unknown;
    layers?: unknown;
    tilecount?: unknown;
    tileheight?: unknown;
    tiles?: unknown;
    tilewidth?: unknown;
    type?: unknown;
  };
  if (obj.type === 'map') return TilemapFormatKindTiledTmj;
  if (obj.type === 'tileset') return TilemapFormatKindTiledTsj;
  // A document that names some OTHER `type` is something else's format saying so, and guessing past its own
  // declaration is how an unrelated JSON asset acquires a Tiled parser in someone's bundle.
  if (typeof obj.type === 'string') return null;
  if (typeof obj.tilewidth !== 'number' || typeof obj.tileheight !== 'number') return null;
  if (Array.isArray(obj.layers)) return TilemapFormatKindTiledTmj;
  const tilesetShaped = typeof obj.tilecount === 'number' || typeof obj.image === 'string' || Array.isArray(obj.tiles);
  return tilesetShaped ? TilemapFormatKindTiledTsj : null;
}

// The name of the first ELEMENT in an XML document, skipping the declaration, comments and the doctype, or
// `null` when the text does not open an element. Cheap on purpose: see `readTilemapFormatKind`.
function readXmlRootElementName(trimmed: string): string | null {
  let index = 0;
  while (index < trimmed.length) {
    if (!trimmed.startsWith('<', index)) {
      const next = trimmed.indexOf('<', index);
      if (next < 0) return null;
      index = next;
      continue;
    }
    if (trimmed.startsWith('<?', index) || trimmed.startsWith('<!', index)) {
      const close = trimmed.startsWith('<!--', index) ? trimmed.indexOf('-->', index) : trimmed.indexOf('>', index);
      if (close < 0) return null;
      index = close + (trimmed.startsWith('<!--', index) ? 3 : 1);
      continue;
    }
    const match = /^<([A-Za-z_][\w.:-]*)/.exec(trimmed.slice(index));
    return match === null ? null : match[1];
  }
  return null;
}

let _tilemapRegistry: ReadonlyMap<Kind, TilemapFormatEntry> | null = null;
let _tilesetRegistry: ReadonlyMap<Kind, TilesetFormatEntry> | null = null;
