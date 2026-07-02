import type { TextureAtlasFormatKind } from '@flighthq/types';
import {
  TextureAtlasFormatKindAseprite,
  TextureAtlasFormatKindLibgdxAtlas,
  TextureAtlasFormatKindStarling,
  TextureAtlasFormatKindTexturePacker,
} from '@flighthq/types';

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
  const trimmed = content.trimStart();
  if (trimmed === '') return null;
  if (trimmed.startsWith('<')) {
    return trimmed.includes('<TextureAtlas') ? TextureAtlasFormatKindStarling : null;
  }
  if (trimmed.startsWith('{')) {
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
  // Plain-text path: libGDX atlas pages open with an image line followed by `key: value`
  // header lines (`size:`, `format:`) and per-region `xy:` / `orig:` blocks.
  if (/^\s*(size|format|filter|repeat)\s*:/m.test(trimmed) && /^\s*(xy|orig)\s*:/m.test(trimmed)) {
    return TextureAtlasFormatKindLibgdxAtlas;
  }
  return null;
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
