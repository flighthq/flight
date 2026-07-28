import type { GridSliceOptions, Texture, TextureAtlas } from '@flighthq/types/contract';

import { createTextureAtlas } from './textureAtlas';
import { createTextureAtlasRegion } from './textureAtlasRegion';

// Builds row-major atlas regions for a regular grid. Per-axis margins and spacing stay explicit so
// non-square authoring layouts retain their exact pixel arithmetic. The optional Texture attaches
// the backing without making grid slicing depend on a loader.
export function createTextureAtlasFromGrid(
  options: Readonly<GridSliceOptions>,
  texture: Texture | null = null,
): TextureAtlas {
  const {
    columns,
    rows,
    imageWidth,
    imageHeight,
    marginX = 0,
    marginY = 0,
    spacingX = 0,
    spacingY = 0,
    namePrefix = 'frame_',
  } = options;
  const frameWidth = options.frameWidth ?? Math.floor((imageWidth - 2 * marginX - spacingX * (columns - 1)) / columns);
  const frameHeight = options.frameHeight ?? Math.floor((imageHeight - 2 * marginY - spacingY * (rows - 1)) / rows);
  const atlas = createTextureAtlas({ texture });
  let id = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      atlas.regions.push(
        createTextureAtlasRegion({
          height: frameHeight,
          id,
          name: `${namePrefix}${id}`,
          width: frameWidth,
          x: marginX + column * (frameWidth + spacingX),
          y: marginY + row * (frameHeight + spacingY),
        }),
      );
      id++;
    }
  }
  return atlas;
}
