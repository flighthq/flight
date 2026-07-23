import { createTextureAtlasRegion } from '@flighthq/textureatlas';
import type {
  TextureAtlas,
  TextureAtlasAsepriteArrayFrame,
  TextureAtlasAsepriteBaseFrame,
  TextureAtlasAsepriteDocument,
} from '@flighthq/types';

// Convenience variant that accepts an already-parsed Aseprite document object.
export function parseTextureAtlasAsepriteDocument(
  doc: TextureAtlasAsepriteDocument,
  atlas: TextureAtlas,
): TextureAtlas {
  atlas.regions.length = 0;
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
  const doc = JSON.parse(json) as TextureAtlasAsepriteDocument;
  return parseTextureAtlasAsepriteDocument(doc, atlas);
}

function applyAsepriteFrame(
  atlas: TextureAtlas,
  name: string,
  entry: TextureAtlasAsepriteArrayFrame | TextureAtlasAsepriteBaseFrame,
): void {
  atlas.regions.push(
    createTextureAtlasRegion({
      height: entry.frame.h,
      id: atlas.regions.length,
      name,
      originalHeight: entry.trimmed ? entry.sourceSize.h : null,
      originalWidth: entry.trimmed ? entry.sourceSize.w : null,
      pivotX: null,
      pivotY: null,
      rotated: entry.rotated,
      sourceX: entry.spriteSourceSize.x,
      sourceY: entry.spriteSourceSize.y,
      trimmed: entry.trimmed,
      width: entry.frame.w,
      x: entry.frame.x,
      y: entry.frame.y,
    }),
  );
}
