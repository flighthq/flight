import {
  createTilemap,
  loadTilesetFromURL,
  setTilemapTile,
  setTransformX,
  setTransformY,
  updateSprite,
} from '@flighthq/sdk';

import { render, scale, state } from './render';

const TILE_W = 32;
const TILE_H = 32;
const COLS = 8;
const ROWS = 8;
const SCALE = 2;
const PAD = 40;

const tileset = await loadTilesetFromURL('assets/tileset.png', TILE_W, TILE_H);

const tilemap = createTilemap({ data: { columns: COLS, rows: ROWS, tileset } });
tilemap.scaleX = SCALE * scale;
tilemap.scaleY = SCALE * scale;
setTransformX(tilemap, PAD * scale);
setTransformY(tilemap, PAD * scale);

// Each row shows the idle frame of one character.
// Character n's first frame = n * tileset.columns (row-major stride).
const stride = tileset.columns;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    setTilemapTile(tilemap, c, r, r * stride);
  }
}

function enterFrame(): void {
  if (updateSprite(state, tilemap)) {
    render(tilemap);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
