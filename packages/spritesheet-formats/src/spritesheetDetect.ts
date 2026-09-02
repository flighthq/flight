import {
  createKeyedTable,
  getRegistryTableEntry,
  getRegistryTableKeys,
  withRegistryTableEntry,
  withoutRegistryTableEntry,
} from '@flighthq/registry/contract';
import type {
  KeyedTable,
  SpritesheetData,
  SpritesheetFormatKind,
  SpritesheetParseOptions,
} from '@flighthq/types/contract';
import {
  SpritesheetFormatKindAseprite as ASEPRITE,
  SpritesheetFormatKindCocosPlist as COCOS_PLIST,
  SpritesheetFormatKindLibgdxAtlas as LIBGDX_ATLAS,
  SpritesheetFormatKindStarling as STARLING,
  SpritesheetFormatKindTexturePacker as TEXTURE_PACKER,
} from '@flighthq/types/contract';

import { parseAsepriteSpritesheet } from './asepriteParse';
import { parseCocosPlistSpritesheet } from './cocosPlistParse';
import { parseLibgdxAtlasSpritesheet } from './libgdxAtlasParse';
import { parseStarlingSpritesheet } from './starlingParse';
import { parseTexturePackerSpritesheet } from './texturePackerParse';

interface FormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options: SpritesheetParseOptions) => SpritesheetData;
}

interface RegisteredFormatEntry {
  entry: FormatEntry;
  order: number;
}

function detectTexturePacker(text: string): boolean {
  if (text.trimStart()[0] !== '{') return false;
  return /"meta"\s*:/.test(text) && /"app"\s*:/.test(text);
}

function detectAseprite(text: string): boolean {
  if (text.trimStart()[0] !== '{') return false;
  return /"meta"\s*:/.test(text) && /aseprite\.org/i.test(text);
}

function detectCocosPlist(text: string): boolean {
  const trimmed = text.trimStart();
  return (trimmed[0] === '<' || trimmed.startsWith('<?xml')) && /<plist\b/i.test(text);
}

function detectStarling(text: string): boolean {
  return /<TextureAtlas\b/i.test(text);
}

function detectLibgdxAtlas(text: string): boolean {
  const ch = text.trimStart()[0];
  if (ch === '<' || ch === '{') return false;
  return /^\s*rotate\s*:/m.test(text) || /^\s*xy\s*:/m.test(text);
}

// Seeds the built-in formats. Insertion order is load-bearing: detectSpritesheetFormat returns the
// FIRST entry whose detector matches, a Map iterates in insertion order, and the detectors overlap.
//
// Specifically, an Aseprite export carries `"app": "http://www.aseprite.org/"`, which satisfies the
// TexturePacker detector's `"meta":` + `"app":` test as well as its own — so Aseprite is only chosen
// because it is registered first. Reordering these calls (alphabetising them, say) would silently
// route every Aseprite file to the TexturePacker parser: the wrong parser, not an error. The
// narrower detector must precede the broader one it overlaps with, and
// `describe('registry ordering')` pins that.
//
// Built-ins are seeded here rather than self-registering from their own modules on import. That is
// deliberate and not an oversight: this package declares `"sideEffects": false`, and a top-level
// `registerSpritesheetFormat` call in each parser module would be exactly the import-time side effect
// the SDK bans — and would defeat the tree-shaking that currently lets a caller importing one parser
// pay for one parser.
function getRegistry(): KeyedTable<RegisteredFormatEntry> {
  if (_registry !== null) return _registry;
  _registry = createKeyedTable('SpritesheetFormat', 'Unclaimed');
  bindSpritesheetFormat(ASEPRITE, {
    detect: detectAseprite,
    parse: (text) => parseAsepriteSpritesheet(text),
  });
  bindSpritesheetFormat(COCOS_PLIST, {
    detect: detectCocosPlist,
    parse: (text) => parseCocosPlistSpritesheet(text),
  });
  bindSpritesheetFormat(TEXTURE_PACKER, {
    detect: detectTexturePacker,
    parse: (text) => parseTexturePackerSpritesheet(text),
  });
  bindSpritesheetFormat(STARLING, {
    detect: detectStarling,
    parse: (text, opts) => parseStarlingSpritesheet(text, { frameDuration: opts.frameDuration }),
  });
  bindSpritesheetFormat(LIBGDX_ATLAS, {
    detect: detectLibgdxAtlas,
    parse: (text, opts) => parseLibgdxAtlasSpritesheet(text, { frameDuration: opts.frameDuration }),
  });
  return _registry;
}

/** Detect the format kind of a spritesheet text document.
 *
 *  Returns the `SpritesheetFormatKind` of the first registered format whose
 *  `detect` function returns `true`, or `null` when no format is recognized. */
export function detectSpritesheetFormat(text: string): SpritesheetFormatKind | null {
  for (const [kind, registered] of getSpritesheetFormatsInDetectionOrder()) {
    if (registered.entry.detect(text)) return kind;
  }
  return null;
}

/** Retrieve the registered entry for a given `SpritesheetFormatKind`.
 *
 *  Returns the `{ detect, parse }` entry for the given kind, or `null` when no
 *  format with that kind has been registered. Useful for introspecting which formats
 *  are in the registry or for building meta-dispatch logic on top of the registry. */
export function getSpritesheetFormat(kind: SpritesheetFormatKind): Readonly<{
  detect: (text: string) => boolean;
  parse: (text: string, options: SpritesheetParseOptions) => SpritesheetData;
}> | null {
  return getRegistryTableEntry(getRegistry(), kind)?.entry ?? null;
}

/** Return a sorted snapshot of every bound spritesheet-format kind. */
export function getSpritesheetFormatKinds(): readonly SpritesheetFormatKind[] {
  const kinds: SpritesheetFormatKind[] = [];
  getRegistryTableKeys(kinds, getRegistry());
  return kinds;
}

/** Parse a spritesheet text document to a SpritesheetData, auto-detecting the format.
 *
 *  Accepts an optional `formatKind` override — useful when the format is known in advance
 *  and sniffing overhead is undesirable, or when the input is ambiguous.
 *
 *  Returns `null` when the format cannot be recognized (expected failure — not a throw). */
export function parseSpritesheet(
  text: string,
  formatKind?: SpritesheetFormatKind,
  options?: SpritesheetParseOptions,
): SpritesheetData | null {
  const opts: SpritesheetParseOptions = options ?? {};
  const kind = formatKind ?? detectSpritesheetFormat(text);
  if (!kind) return null;
  const registered = getRegistryTableEntry(getRegistry(), kind);
  if (registered === null) return null;
  return registered.entry.parse(text, opts);
}

/** Register a custom spritesheet format for use with `detectSpritesheetFormat` and `parseSpritesheet`.
 *
 *  Registration is last-write-wins; a built-in entry can be replaced by registering
 *  the same `SpritesheetFormatKind`. Third-party formats should use a vendor-prefixed kind
 *  (e.g. `'acme.MyAtlas'`) to avoid colliding with built-ins. */
export function registerSpritesheetFormat(
  kind: SpritesheetFormatKind,
  entry: {
    detect: (text: string) => boolean;
    parse: (text: string, options: SpritesheetParseOptions) => SpritesheetData;
  },
): void {
  bindSpritesheetFormat(kind, entry);
}

/** Remove a format binding, including a caller override of a built-in kind. */
export function unregisterSpritesheetFormat(kind: SpritesheetFormatKind): void {
  _registry = withoutRegistryTableEntry(getRegistry(), kind);
}

function bindSpritesheetFormat(kind: SpritesheetFormatKind, entry: FormatEntry): void {
  const registry = getRegistry();
  const current = getRegistryTableEntry(registry, kind);
  _registry = withRegistryTableEntry(registry, kind, {
    entry,
    order: current?.order ?? _nextFormatOrder++,
  });
}

function getSpritesheetFormatsInDetectionOrder(): Array<readonly [SpritesheetFormatKind, RegisteredFormatEntry]> {
  const formats: Array<readonly [SpritesheetFormatKind, RegisteredFormatEntry]> = [];
  for (const kind of getSpritesheetFormatKinds()) {
    const registered = getRegistryTableEntry(getRegistry(), kind);
    if (registered !== null) formats.push([kind, registered]);
  }
  formats.sort((a, b) => a[1].order - b[1].order);
  return formats;
}

let _registry: KeyedTable<RegisteredFormatEntry> | null = null;
let _nextFormatOrder = 0;
