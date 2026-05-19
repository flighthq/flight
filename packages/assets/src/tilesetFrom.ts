import type { ImageSource, TextureAtlas, Tileset } from '@flighthq/types';

import { createTextureAtlas } from './textureAtlas';
import { createTileset, initTilesetRegions } from './tileset';

export function tilesetFromAtlas(atlas: TextureAtlas, tileWidth: number, tileHeight: number): Tileset {
  const image = atlas.image;
  const columns = image !== null ? Math.floor(image.width / tileWidth) : 0;
  const rows = image !== null ? Math.floor(image.height / tileHeight) : 0;
  const tileset = createTileset({ atlas, columns, rows, tileHeight, tileWidth });
  initTilesetRegions(tileset);
  return tileset;
}

export function tilesetFromImageSource(source: ImageSource, tileWidth: number, tileHeight: number): Tileset {
  return tilesetFromAtlas(createTextureAtlas({ image: source }), tileWidth, tileHeight);
}
