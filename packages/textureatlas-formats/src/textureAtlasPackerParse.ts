import { createTextureAtlasRegion } from '@flighthq/textureatlas';
import type { TextureAtlas } from '@flighthq/types';

import type {
  TextureAtlasPackerArrayFrame,
  TextureAtlasPackerDocument,
  TextureAtlasPackerHashFrame,
} from './textureAtlasPackerSchema';

export interface TextureAtlasPackerParseOptions {
  /** If true, strips a leading slash and any path components from frame names. Defaults to false. */
  stripPathPrefix?: boolean;
}

// Convenience variant that accepts an already-parsed object (avoids a redundant JSON.parse).
export function parseTextureAtlasPackerDocument(
  doc: TextureAtlasPackerDocument,
  atlas: TextureAtlas,
  options?: TextureAtlasPackerParseOptions,
): TextureAtlas {
  applyDocument(atlas, doc, options ?? {});
  return atlas;
}

// Parses a TexturePacker JSON string and populates `atlas.regions`.
// Supports both the JSON-hash and JSON-array shapes.
// Existing regions in `atlas` are cleared. Returns `atlas` for convenience.
export function parseTextureAtlasPackerJson(
  json: string,
  atlas: TextureAtlas,
  options?: TextureAtlasPackerParseOptions,
): TextureAtlas {
  const doc = JSON.parse(json) as TextureAtlasPackerDocument;
  applyDocument(atlas, doc, options ?? {});
  return atlas;
}

// Populates `atlas.regions` from a parsed TexturePacker document.
// Existing regions are cleared before parsing.
function applyDocument(
  atlas: TextureAtlas,
  doc: TextureAtlasPackerDocument,
  options: TextureAtlasPackerParseOptions,
): void {
  atlas.regions.length = 0;
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

function applyFrame(
  atlas: TextureAtlas,
  name: string,
  entry: TextureAtlasPackerArrayFrame | TextureAtlasPackerHashFrame,
  options: TextureAtlasPackerParseOptions,
): void {
  const normalized = normalizeFrameName(name, options.stripPathPrefix ?? false);
  const region = createTextureAtlasRegion({
    height: entry.rotated ? entry.frame.w : entry.frame.h,
    id: atlas.regions.length,
    name: normalized,
    originalHeight: entry.trimmed ? entry.sourceSize.h : null,
    originalWidth: entry.trimmed ? entry.sourceSize.w : null,
    pivotX: entry.pivot !== undefined ? entry.pivot.x : null,
    pivotY: entry.pivot !== undefined ? entry.pivot.y : null,
    rotated: entry.rotated,
    sourceX: entry.spriteSourceSize.x,
    sourceY: entry.spriteSourceSize.y,
    trimmed: entry.trimmed,
    width: entry.rotated ? entry.frame.h : entry.frame.w,
    x: entry.frame.x,
    y: entry.frame.y,
  });
  atlas.regions.push(region);
}

// Normalize a frame name by optionally stripping path prefixes.
function normalizeFrameName(name: string, strip: boolean): string {
  if (!strip) return name;
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return slash >= 0 ? name.slice(slash + 1) : name;
}
