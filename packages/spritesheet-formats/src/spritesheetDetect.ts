import type { SpritesheetData } from '@flighthq/spritesheet';
import type { SpritesheetFormatKind } from '@flighthq/types';
import {
  SpritesheetFormatKindAseprite as ASEPRITE,
  SpritesheetFormatKindCocosPlist as COCOS_PLIST,
  SpritesheetFormatKindLibgdxAtlas as LIBGDX_ATLAS,
  SpritesheetFormatKindStarling as STARLING,
  SpritesheetFormatKindTexturePacker as TEXTURE_PACKER,
} from '@flighthq/types';

import { parseAsepriteSpritesheet } from './asepriteParse';
import { parseCocosPlistSpritesheet } from './cocosPlistParse';
import { parseLibgdxAtlasSpritesheet } from './libgdxAtlasParse';
import { parseStarlingSpritesheet } from './starlingParse';
import { parseTexturePackerSpritesheet } from './texturePackerParse';

export interface SpritesheetParseOptions {
  /** Default frame duration in ms used by formats that do not embed per-frame timing. Defaults to 100. */
  frameDuration?: number;
  /** Atlas image height for formats that omit dimensions (e.g. Starling). */
  imageHeight?: number;
  /** Atlas image width for formats that omit dimensions (e.g. Starling). */
  imageWidth?: number;
}

// ─── Format registry ─────────────────────────────────────────────────────────

interface FormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, options: SpritesheetParseOptions) => SpritesheetData;
}

type FormatRegistry = Map<SpritesheetFormatKind, FormatEntry>;

let _registry: FormatRegistry | null = null;

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

function getRegistry(): FormatRegistry {
  if (_registry !== null) return _registry;
  _registry = new Map();
  _registry.set(ASEPRITE, {
    detect: detectAseprite,
    parse: (text, opts) => parseAsepriteSpritesheet(text, { frameDuration: opts.frameDuration }),
  });
  _registry.set(COCOS_PLIST, {
    detect: detectCocosPlist,
    parse: (text, opts) => parseCocosPlistSpritesheet(text, { frameDuration: opts.frameDuration }),
  });
  _registry.set(TEXTURE_PACKER, {
    detect: detectTexturePacker,
    parse: (text, opts) => parseTexturePackerSpritesheet(text, { frameDuration: opts.frameDuration }),
  });
  _registry.set(STARLING, {
    detect: detectStarling,
    parse: (text, opts) =>
      parseStarlingSpritesheet(text, {
        frameDuration: opts.frameDuration,
        imageHeight: opts.imageHeight,
        imageWidth: opts.imageWidth,
      }),
  });
  _registry.set(LIBGDX_ATLAS, {
    detect: detectLibgdxAtlas,
    parse: (text, opts) => parseLibgdxAtlasSpritesheet(text, { frameDuration: opts.frameDuration }),
  });
  return _registry;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Detect the format kind of a spritesheet text document.
 *
 *  Returns the `SpritesheetFormatKind` of the first registered format whose
 *  `detect` function returns `true`, or `null` when no format is recognized. */
export function detectSpritesheetFormat(text: string): SpritesheetFormatKind | null {
  for (const [kind, entry] of getRegistry()) {
    if (entry.detect(text)) return kind;
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
  return getRegistry().get(kind) ?? null;
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
  const entry = getRegistry().get(kind);
  if (!entry) return null;
  return entry.parse(text, opts);
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
  getRegistry().set(kind, entry);
}
