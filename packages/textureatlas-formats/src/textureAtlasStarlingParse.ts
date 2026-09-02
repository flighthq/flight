import { createTextureAtlasRegion } from '@flighthq/textureatlas/contract';
import type { TextureAtlas } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { resetTextureAtlasPageMeta } from './textureAtlasPageMeta';

// Populates `atlas.regions` from a Starling / Sparrow XML string.
// Existing regions are cleared before parsing. Returns `atlas` for convenience.
//
// Takes no image-dimension options. Starling XML declares no atlas size, but the one consumer that
// needs it — getTextureAtlasRegionUv — takes width and height as its own arguments, so a parse-time
// hint would be a second path to a value the caller already supplies at the point of use.
export function parseTextureAtlasStarlingXml(xml: string, atlas: TextureAtlas): TextureAtlas {
  atlas.regions.length = 0;
  resetTextureAtlasPageMeta(atlas);
  const root = parseXmlDocument(xml);
  if (!root) return atlas;
  // The TextureAtlas element may be the root or a child.
  const atlasEl = root.name === 'TextureAtlas' ? root : (root.children.find((c) => c.name === 'TextureAtlas') ?? root);
  // Starling declares its page image in `imagePath` and nothing else about the page: no size, no
  // scale. Those stay unknown rather than being invented.
  atlas.imageName = atlasEl.attributes['imagePath'] ?? null;
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
