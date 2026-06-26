import { createTextureAtlasRegion } from '@flighthq/textureatlas';
import type { TextureAtlas } from '@flighthq/types';

// Parses a libGDX / Spine text-format atlas string and populates `atlas.regions`.
// Handles single and multi-page atlases; regions from all pages are concatenated.
// Existing regions in `atlas` are cleared. Returns `atlas` for convenience.
export function parseTextureAtlasLibgdxAtlas(text: string, atlas: TextureAtlas): TextureAtlas {
  atlas.regions.length = 0;
  const lines = text.split(/\r?\n/);
  let i = 0;
  let id = 0;
  while (i < lines.length) {
    // Skip blank lines (page separator or leading whitespace)
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;
    // Page header: first non-blank line is the image file name (no colon)
    const maybeImage = lines[i].trim();
    if (!maybeImage.includes(':')) {
      i++; // consume image filename
      // Skip page-level key:value pairs
      while (i < lines.length && lines[i].trim() !== '') {
        if (lines[i].trim().includes(':')) i++;
        else break;
      }
    }
    // Read regions until blank line or EOF
    while (i < lines.length && lines[i].trim() !== '') {
      const line = lines[i].trim();
      // If a line has no colon it is a region name
      if (!line.includes(':')) {
        const regionName = line;
        i++;
        let atlasX = 0;
        let atlasY = 0;
        let atlasW = 0;
        let atlasH = 0;
        let origW = 0;
        let origH = 0;
        let offsetX = 0;
        let offsetY = 0;
        let rotated = false;
        let index = -1;
        // Read region key:value pairs
        while (i < lines.length) {
          const kv = lines[i].trim();
          if (kv === '' || !kv.includes(':')) break;
          const colon = kv.indexOf(':');
          const key = kv.slice(0, colon).trim();
          const value = kv.slice(colon + 1).trim();
          i++;
          switch (key) {
            case 'rotate':
              rotated = value === 'true';
              break;
            case 'xy': {
              const parts = value.split(',');
              atlasX = parseFloat(parts[0]?.trim() ?? '0');
              atlasY = parseFloat(parts[1]?.trim() ?? '0');
              break;
            }
            case 'size': {
              const parts = value.split(',');
              atlasW = parseFloat(parts[0]?.trim() ?? '0');
              atlasH = parseFloat(parts[1]?.trim() ?? '0');
              break;
            }
            case 'orig': {
              const parts = value.split(',');
              origW = parseFloat(parts[0]?.trim() ?? '0');
              origH = parseFloat(parts[1]?.trim() ?? '0');
              break;
            }
            case 'offset': {
              const parts = value.split(',');
              offsetX = parseFloat(parts[0]?.trim() ?? '0');
              offsetY = parseFloat(parts[1]?.trim() ?? '0');
              break;
            }
            case 'index':
              index = parseInt(value, 10);
              break;
          }
        }
        const name = index >= 0 ? `${regionName}_${index}` : regionName;
        const trimmed = origW > 0 && origH > 0 && (origW !== atlasW || origH !== atlasH);
        atlas.regions.push(
          createTextureAtlasRegion({
            height: atlasH,
            id,
            name,
            originalHeight: trimmed ? origH : null,
            originalWidth: trimmed ? origW : null,
            pivotX: null,
            pivotY: null,
            rotated,
            sourceX: offsetX,
            sourceY: offsetY,
            trimmed,
            width: atlasW,
            x: atlasX,
            y: atlasY,
          }),
        );
        id++;
      } else {
        i++; // skip unexpected keyed lines at page level
      }
    }
  }
  return atlas;
}
