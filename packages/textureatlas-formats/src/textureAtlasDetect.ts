import {
  createKeyedTable,
  getRegistryTableEntry,
  getRegistryTableKeys,
  withRegistryTableEntry,
  withoutRegistryTableEntry,
} from '@flighthq/registry/contract';
import type {
  KeyedTable,
  TextureAtlas,
  TextureAtlasFormatKind,
  TextureAtlasParseOptions,
} from '@flighthq/types/contract';
import {
  TextureAtlasFormatKindAseprite,
  TextureAtlasFormatKindLibgdxAtlas,
  TextureAtlasFormatKindStarling,
  TextureAtlasFormatKindTexturePacker,
} from '@flighthq/types/contract';

import { parseTextureAtlasAsepriteJson } from './textureAtlasAsepriteParse';
import { parseTextureAtlasLibgdxAtlas } from './textureAtlasLibgdxParse';
import { parseTextureAtlasStarlingXml } from './textureAtlasStarlingParse';
import { parseTexturePackerAtlasJson } from './texturePackerAtlasParse';

// One entry per texture-atlas format: how to recognise it, and how to read it into an atlas.
interface FormatEntry {
  detect: (content: string) => boolean;
  parse: (content: string, atlas: TextureAtlas, options: TextureAtlasParseOptions) => TextureAtlas;
}

interface RegisteredFormatEntry {
  entry: FormatEntry;
  order: number;
}

// Seeds the built-in formats.
//
// Unlike the sibling registry in `@flighthq/spritesheet-formats`, insertion order here is NOT
// load-bearing: the four detectors are mutually exclusive by construction, and
// `describe('registry')` asserts that directly over a corpus rather than relying on a first-match
// ordering nobody can see. The Aseprite/TexturePacker pair is the one that could overlap — both are
// `{frames, meta}` JSON — so each detector carries the full disambiguation (the `meta.app` string,
// falling back to Aseprite's per-frame `duration`) rather than one of them being a broad net the
// other has to be registered ahead of.
//
// Built-ins are seeded here rather than self-registering from their own modules on import: this
// package declares `"sideEffects": false`, so a top-level `registerTextureAtlasFormat` call in each
// parser would be the import-time side effect the SDK bans, and it would drag every parser into any
// consumer that imported one.
function getRegistry(): KeyedTable<RegisteredFormatEntry> {
  if (_registry !== null) return _registry;
  _registry = createKeyedTable('TextureAtlasFormat', 'Unclaimed');
  bindTextureAtlasFormat(TextureAtlasFormatKindAseprite, {
    detect: detectAseprite,
    parse: (content, atlas) => parseTextureAtlasAsepriteJson(content, atlas),
  });
  bindTextureAtlasFormat(TextureAtlasFormatKindLibgdxAtlas, {
    detect: detectLibgdxAtlas,
    parse: (content, atlas) => parseTextureAtlasLibgdxAtlas(content, atlas),
  });
  bindTextureAtlasFormat(TextureAtlasFormatKindStarling, {
    detect: detectStarling,
    parse: (content, atlas) => parseTextureAtlasStarlingXml(content, atlas),
  });
  bindTextureAtlasFormat(TextureAtlasFormatKindTexturePacker, {
    detect: detectTexturePacker,
    parse: (content, atlas, options) => parseTexturePackerAtlasJson(content, atlas, options),
  });
  return _registry;
}

function detectStarling(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('<') && trimmed.includes('<TextureAtlas');
}

function detectLibgdxAtlas(content: string): boolean {
  const trimmed = content.trimStart();
  if (trimmed === '' || trimmed.startsWith('<') || trimmed.startsWith('{')) return false;
  return /^\s*(size|format|filter|repeat)\s*:/m.test(trimmed) && /^\s*(xy|orig)\s*:/m.test(trimmed);
}

// Aseprite and TexturePacker share the `{frames, meta}` JSON shape, so each detector runs the whole
// disambiguation and answers only for itself. That is what makes them mutually exclusive: exactly one
// can be true for any JSON atlas document, so neither depends on being registered first.
function detectAseprite(content: string): boolean {
  return readJsonAtlasKind(content) === TextureAtlasFormatKindAseprite;
}

function detectTexturePacker(content: string): boolean {
  return readJsonAtlasKind(content) === TextureAtlasFormatKindTexturePacker;
}

// The shared JSON disambiguation both JSON detectors ask. Returns null when the content is not a
// frames-bearing JSON atlas at all.
function readJsonAtlasKind(content: string): TextureAtlasFormatKind | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('{')) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as { frames?: unknown; meta?: unknown };
  if (obj.frames === undefined) return null;
  const app = readMetaApp(obj.meta).toLowerCase();
  if (app.includes('aseprite')) return TextureAtlasFormatKindAseprite;
  if (app.includes('texturepacker') || app.includes('codeandweb')) return TextureAtlasFormatKindTexturePacker;
  // No recognisable app string — Aseprite frames carry a per-frame `duration`, TexturePacker's do not.
  return hasFrameDuration(obj.frames) ? TextureAtlasFormatKindAseprite : TextureAtlasFormatKindTexturePacker;
}

/** Sniff the text content of a texture-atlas descriptor and return its format kind, or
 *  `null` when no supported format is recognisable.
 *
 *  Detection is structural, not extension-based, and covers the four formats with parsers:
 *  - Starling / Sparrow XML: an XML document whose root (or a child) is `<TextureAtlas`.
 *  - libGDX / Spine text: a plain-text page header followed by `size:` / `format:` lines
 *    and per-region `xy:` / `orig:` blocks.
 *  - Aseprite JSON and TexturePacker JSON share a `{ frames, meta }` shape and are
 *    disambiguated by `meta.app` (`aseprite` vs `texturepacker`/`codeandweb`), falling back
 *    to the Aseprite-only per-frame `duration` field.
 *
 *  Returns `null` for unknown or corrupt input — never throws. This is the texture-atlas
 *  counterpart of `detectParticleFormat` in `@flighthq/particles-formats`. */
export function detectTextureAtlasFormat(content: string): TextureAtlasFormatKind | null {
  if (typeof content !== 'string') return null;
  if (content.trimStart() === '') return null;
  for (const [kind, registered] of getTextureAtlasFormatsInDetectionOrder()) {
    if (registered.entry.detect(content)) return kind;
  }
  return null;
}

/** Retrieve the registered entry for a `TextureAtlasFormatKind`, or `null` when none is registered.
 *
 *  Useful for introspecting which formats are available, or for calling one format's detector or
 *  parser directly without going through detection. */
export function getTextureAtlasFormat(kind: TextureAtlasFormatKind): Readonly<{
  detect: (content: string) => boolean;
  parse: (content: string, atlas: TextureAtlas, options: TextureAtlasParseOptions) => TextureAtlas;
}> | null {
  return getRegistryTableEntry(getRegistry(), kind)?.entry ?? null;
}

/** Return a sorted snapshot of every bound texture-atlas format kind. */
export function getTextureAtlasFormatKinds(): readonly TextureAtlasFormatKind[] {
  const kinds: TextureAtlasFormatKind[] = [];
  getRegistryTableKeys(kinds, getRegistry());
  return kinds;
}

/** Parse a texture-atlas descriptor into `atlas`, auto-detecting the format.
 *
 *  Pass `formatKind` to skip detection when the format is already known. Returns `atlas` on success
 *  and `null` when the format is not recognised — an expected failure, not a throw. Existing regions
 *  in `atlas` are cleared by the format parsers, so a failed detection leaves the atlas untouched
 *  rather than half-cleared. */
export function parseTextureAtlas(
  content: string,
  atlas: TextureAtlas,
  formatKind?: TextureAtlasFormatKind,
  options?: TextureAtlasParseOptions,
): TextureAtlas | null {
  const kind = formatKind ?? detectTextureAtlasFormat(content);
  if (kind === null || kind === undefined) return null;
  const registered = getRegistryTableEntry(getRegistry(), kind);
  if (registered === null) return null;
  return registered.entry.parse(content, atlas, options ?? {});
}

/** Register a custom texture-atlas format for `detectTextureAtlasFormat` and `parseTextureAtlas`.
 *
 *  Last-write-wins: registering a built-in kind replaces it. Third-party formats should use a
 *  vendor-prefixed kind (e.g. `'acme.MyAtlas'`) so they cannot collide with a built-in.
 *
 *  A custom detector should be as narrow as the built-ins are — they are mutually exclusive, so
 *  detection does not depend on registration order today, and a broad custom detector is the one way
 *  to reintroduce that dependence. */
export function registerTextureAtlasFormat(
  kind: TextureAtlasFormatKind,
  entry: {
    detect: (content: string) => boolean;
    parse: (content: string, atlas: TextureAtlas, options: TextureAtlasParseOptions) => TextureAtlas;
  },
): void {
  bindTextureAtlasFormat(kind, entry);
}

/** Remove a format binding, including a caller override of a built-in kind. */
export function unregisterTextureAtlasFormat(kind: TextureAtlasFormatKind): void {
  _registry = withoutRegistryTableEntry(getRegistry(), kind);
}

function bindTextureAtlasFormat(kind: TextureAtlasFormatKind, entry: FormatEntry): void {
  const registry = getRegistry();
  const current = getRegistryTableEntry(registry, kind);
  _registry = withRegistryTableEntry(registry, kind, {
    entry,
    order: current?.order ?? _nextFormatOrder++,
  });
}

function getTextureAtlasFormatsInDetectionOrder(): Array<readonly [TextureAtlasFormatKind, RegisteredFormatEntry]> {
  const formats: Array<readonly [TextureAtlasFormatKind, RegisteredFormatEntry]> = [];
  for (const kind of getTextureAtlasFormatKinds()) {
    const registered = getRegistryTableEntry(getRegistry(), kind);
    if (registered !== null) formats.push([kind, registered]);
  }
  formats.sort((a, b) => a[1].order - b[1].order);
  return formats;
}

function firstFrame(frames: unknown): unknown {
  if (Array.isArray(frames)) return frames[0];
  if (frames !== null && typeof frames === 'object') {
    for (const value of Object.values(frames as Record<string, unknown>)) return value;
  }
  return undefined;
}

function hasFrameDuration(frames: unknown): boolean {
  const frame = firstFrame(frames);
  return frame !== null && typeof frame === 'object' && typeof (frame as { duration?: unknown }).duration === 'number';
}

function readMetaApp(meta: unknown): string {
  if (meta === null || typeof meta !== 'object') return '';
  const app = (meta as { app?: unknown }).app;
  return typeof app === 'string' ? app : '';
}

let _registry: KeyedTable<RegisteredFormatEntry> | null = null;
let _nextFormatOrder = 0;
