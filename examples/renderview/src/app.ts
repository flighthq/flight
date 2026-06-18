import {
  addTextureAtlasRegion,
  createSprite,
  createTextureAtlas,
  invalidateNodeLocalTransform,
  loadImageResourceFromURL,
} from '@flighthq/sdk';

import { render, scale } from './render';

const SCALE = 4;
const TILE_SIZE = 32;
const WIDTH = 256;
const HEIGHT = 256;

const source = await loadImageResourceFromURL('assets/tileset.png');

const atlas = createTextureAtlas({ image: source });
addTextureAtlasRegion(atlas, 0, 0, TILE_SIZE, TILE_SIZE);

const root = createSprite();
root.data.atlas = atlas;
root.data.id = 0;
root.scaleX = SCALE * scale;
root.scaleY = SCALE * scale;
root.x = ((WIDTH - TILE_SIZE * SCALE) * scale) / 2;
root.y = ((HEIGHT - TILE_SIZE * SCALE) * scale) / 2;
invalidateNodeLocalTransform(root);

function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
