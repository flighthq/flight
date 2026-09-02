import { createTextureAtlasRegion } from '@flighthq/textureatlas/contract';
import type {
  TextureAtlas,
  TexturePackerAtlasArrayFrame,
  TexturePackerAtlasDocument,
  TexturePackerAtlasHashFrame,
  TexturePackerAtlasParseOptions,
} from '@flighthq/types/contract';

import { readTextureAtlasScale, resetTextureAtlasPageMeta } from './textureAtlasPageMeta';

// Convenience variant that accepts an already-parsed object (avoids a redundant JSON.parse).
export function parseTexturePackerAtlasDocument(
  doc: TexturePackerAtlasDocument,
  atlas: TextureAtlas,
  options?: TexturePackerAtlasParseOptions,
): TextureAtlas {
  applyDocument(atlas, doc, options ?? {});
  return atlas;
}

// Parses a TexturePacker JSON string and populates `atlas.regions`.
// Supports both the JSON-hash and JSON-array shapes.
// Existing regions in `atlas` are cleared. Returns `atlas` for convenience.
export function parseTexturePackerAtlasJson(
  json: string,
  atlas: TextureAtlas,
  options?: TexturePackerAtlasParseOptions,
): TextureAtlas {
  let doc: TexturePackerAtlasDocument;
  try {
    doc = JSON.parse(json) as TexturePackerAtlasDocument;
  } catch {
    // Malformed JSON is an expected failure (sentinel, not a throw) — return the atlas unchanged,
    // matching the Starling XML path's `if (!root) return atlas` and the never-throw importer policy.
    return atlas;
  }
  applyDocument(atlas, doc, options ?? {});
  return atlas;
}

// Populates `atlas.regions` from a parsed TexturePacker document.
// Existing regions are cleared before parsing.
function applyDocument(
  atlas: TextureAtlas,
  doc: TexturePackerAtlasDocument,
  options: TexturePackerAtlasParseOptions,
): void {
  atlas.regions.length = 0;
  applyPageMeta(atlas, doc);
  if (Array.isArray(doc.frames)) {
    for (const entry of doc.frames) {
      applyFrame(atlas, entry.filename, entry, options);
    }
  } else {
    for (const [frameName, entry] of Object.entries(doc.frames)) {
      applyFrame(atlas, frameName, entry, options);
    }
  }
}

function applyPageMeta(atlas: TextureAtlas, doc: TexturePackerAtlasDocument): void {
  resetTextureAtlasPageMeta(atlas);
  const meta = doc.meta;
  if (meta === undefined) return;
  atlas.imageName = meta.image ?? null;
  atlas.imageWidth = meta.size?.w ?? 0;
  atlas.imageHeight = meta.size?.h ?? 0;
  atlas.scale = readTextureAtlasScale(meta.scale);
}

// A frame with no `frame` rect describes no region and is skipped. `sourceSize` and
// `spriteSourceSize` fall back rather than being dereferenced blind: reading them unguarded threw a
// raw TypeError out of the parser on any document whose frames were not fully populated, which
// contradicts this package's stated never-throw importer policy — the JSON-parse failure was already
// guarded, but the document-shape failure one line later was not.
function applyFrame(
  atlas: TextureAtlas,
  name: string,
  entry: TexturePackerAtlasArrayFrame | TexturePackerAtlasHashFrame,
  options: TexturePackerAtlasParseOptions,
): void {
  const frame = entry.frame;
  if (frame === null || typeof frame !== 'object') return;
  const normalized = normalizeFrameName(name, options.stripPathPrefix ?? false);
  const trimmed = entry.trimmed === true;
  const sourceSize = entry.sourceSize;
  const spriteSourceSize = entry.spriteSourceSize;
  const region = createTextureAtlasRegion({
    height: entry.rotated ? frame.w : frame.h,
    id: atlas.regions.length,
    name: normalized,
    originalHeight: trimmed && sourceSize !== undefined ? sourceSize.h : null,
    originalWidth: trimmed && sourceSize !== undefined ? sourceSize.w : null,
    pivotX: entry.pivot !== undefined ? entry.pivot.x : null,
    pivotY: entry.pivot !== undefined ? entry.pivot.y : null,
    rotated: entry.rotated,
    sourceX: spriteSourceSize !== undefined ? spriteSourceSize.x : 0,
    sourceY: spriteSourceSize !== undefined ? spriteSourceSize.y : 0,
    trimmed,
    width: entry.rotated ? frame.h : frame.w,
    x: frame.x,
    y: frame.y,
  });
  atlas.regions.push(region);
}

// Normalize a frame name by optionally stripping path prefixes.
function normalizeFrameName(name: string, strip: boolean): string {
  if (!strip) return name;
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return slash >= 0 ? name.slice(slash + 1) : name;
}
