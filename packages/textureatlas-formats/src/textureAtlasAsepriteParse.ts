import { createTextureAtlasRegion } from '@flighthq/textureatlas/contract';
import type {
  TextureAtlas,
  TextureAtlasAsepriteArrayFrame,
  TextureAtlasAsepriteBaseFrame,
  TextureAtlasAsepriteDocument,
} from '@flighthq/types/contract';

import { readTextureAtlasScale, resetTextureAtlasPageMeta } from './textureAtlasPageMeta';

// Convenience variant that accepts an already-parsed Aseprite document object.
export function parseTextureAtlasAsepriteDocument(
  doc: TextureAtlasAsepriteDocument,
  atlas: TextureAtlas,
): TextureAtlas {
  atlas.regions.length = 0;
  applyAsepritePageMeta(atlas, doc);
  if (Array.isArray(doc.frames)) {
    for (const entry of doc.frames) {
      applyAsepriteFrame(atlas, entry.filename, entry);
    }
  } else {
    for (const [frameName, entry] of Object.entries(doc.frames)) {
      applyAsepriteFrame(atlas, frameName, entry);
    }
  }
  return atlas;
}

// Parses an Aseprite JSON string and populates `atlas.regions`.
// Supports both the JSON-hash and JSON-array frame shapes.
// Existing regions in `atlas` are cleared. Returns `atlas` for convenience.
export function parseTextureAtlasAsepriteJson(json: string, atlas: TextureAtlas): TextureAtlas {
  let doc: TextureAtlasAsepriteDocument;
  try {
    doc = JSON.parse(json) as TextureAtlasAsepriteDocument;
  } catch {
    // Malformed JSON is an expected failure (sentinel, not a throw) — return the atlas unchanged,
    // matching the Starling XML path and the never-throw importer policy.
    return atlas;
  }
  return parseTextureAtlasAsepriteDocument(doc, atlas);
}

function applyAsepritePageMeta(atlas: TextureAtlas, doc: TextureAtlasAsepriteDocument): void {
  resetTextureAtlasPageMeta(atlas);
  const meta = doc.meta;
  if (meta === undefined) return;
  atlas.imageName = meta.image ?? null;
  atlas.imageWidth = meta.size?.w ?? 0;
  atlas.imageHeight = meta.size?.h ?? 0;
  atlas.scale = readTextureAtlasScale(meta.scale);
}

// A frame with no `frame` rect describes no region, so it is skipped rather than pushed as a
// zero-sized one. `sourceSize` and `spriteSourceSize` are optional in practice — an untrimmed frame
// has nothing to say with them, and partial or older exports omit them — so they fall back instead of
// being dereferenced blind. Reading them unguarded threw a raw TypeError out of the parser on any
// document whose frames were not fully populated, which contradicts this package's stated never-throw
// importer policy: a truncated or hand-edited descriptor took the caller down instead of yielding the
// regions it could read.
function applyAsepriteFrame(
  atlas: TextureAtlas,
  name: string,
  entry: TextureAtlasAsepriteArrayFrame | TextureAtlasAsepriteBaseFrame,
): void {
  const frame = entry.frame;
  if (frame === null || typeof frame !== 'object') return;
  const trimmed = entry.trimmed === true;
  const sourceSize = entry.sourceSize;
  const spriteSourceSize = entry.spriteSourceSize;
  atlas.regions.push(
    createTextureAtlasRegion({
      height: frame.h,
      id: atlas.regions.length,
      name,
      originalHeight: trimmed && sourceSize !== undefined ? sourceSize.h : null,
      originalWidth: trimmed && sourceSize !== undefined ? sourceSize.w : null,
      pivotX: null,
      pivotY: null,
      rotated: entry.rotated,
      sourceX: spriteSourceSize !== undefined ? spriteSourceSize.x : 0,
      sourceY: spriteSourceSize !== undefined ? spriteSourceSize.y : 0,
      trimmed,
      width: frame.w,
      x: frame.x,
      y: frame.y,
    }),
  );
}
