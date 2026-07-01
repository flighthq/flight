import { createTextureAtlasRegion } from '@flighthq/textureatlas';
import type { TextureAtlas } from '@flighthq/types';
import { parseXmlDocument } from '@flighthq/xml';

export interface TextureAtlasStarlingParseOptions {
  /**
   * Atlas image width in pixels. Starling XML omits atlas dimensions; supply to allow UV
   * computation. When omitted, the atlas image dimensions will be used when available.
   */
  imageWidth?: number;
  /**
   * Atlas image height in pixels.
   */
  imageHeight?: number;
}

// Populates `atlas.regions` from a Starling / Sparrow XML string.
// Existing regions are cleared before parsing. Returns `atlas` for convenience.
export function parseTextureAtlasStarlingXml(
  xml: string,
  atlas: TextureAtlas,
  _options?: TextureAtlasStarlingParseOptions,
): TextureAtlas {
  atlas.regions.length = 0;
  const root = parseXmlDocument(xml);
  if (!root) return atlas;
  // The TextureAtlas element may be the root or a child.
  const atlasEl = root.name === 'TextureAtlas' ? root : (root.children.find((c) => c.name === 'TextureAtlas') ?? root);
  let id = 0;
  for (const el of atlasEl.children) {
    if (el.name !== 'SubTexture') continue;
    const a = el.attributes;
    if (!a['name']) continue;
    const x = parseFloat(a['x'] ?? '0');
    const y = parseFloat(a['y'] ?? '0');
    const width = parseFloat(a['width'] ?? '0');
    const height = parseFloat(a['height'] ?? '0');
    const frameWidth = a['frameWidth'] !== undefined ? parseFloat(a['frameWidth']) : null;
    const frameHeight = a['frameHeight'] !== undefined ? parseFloat(a['frameHeight']) : null;
    const trimmed = frameWidth !== null || a['frameX'] !== undefined;
    const rotated = a['rotated'] === 'true';
    // Pivot in Starling is in source (original frame) pixel coordinates.
    const pivotX = a['pivotX'] !== undefined ? parseFloat(a['pivotX']) : null;
    const pivotY = a['pivotY'] !== undefined ? parseFloat(a['pivotY']) : null;
    atlas.regions.push(
      createTextureAtlasRegion({
        height,
        id,
        name: a['name'],
        originalHeight: trimmed ? (frameHeight ?? height) : null,
        originalWidth: trimmed ? (frameWidth ?? width) : null,
        pivotX,
        pivotY,
        rotated,
        sourceX: a['frameX'] !== undefined ? -parseFloat(a['frameX']) : 0,
        sourceY: a['frameY'] !== undefined ? -parseFloat(a['frameY']) : 0,
        trimmed,
        width,
        x,
        y,
      }),
    );
    id++;
  }
  return atlas;
}
