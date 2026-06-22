import { createTilemap, invalidateNodeLocalTransform, loadTilesetFromUrl, setTilemapTile } from '@flighthq/sdk';

import { render, scale } from './render';

const TILE_W = 32;
const TILE_H = 32;
const COLS = 8;
const ROWS = 8;
const SCALE = 2;
const PAD = 40;

const tileset = await loadTilesetFromUrl('assets/tileset.png', TILE_W, TILE_H);

const tilemap = createTilemap({ data: { columns: COLS, rows: ROWS, tileset } });
tilemap.scaleX = SCALE * scale;
tilemap.scaleY = SCALE * scale;
tilemap.x = PAD * scale;
tilemap.y = PAD * scale;
invalidateNodeLocalTransform(tilemap);

// Each row shows the idle frame of one character.
// Character n's first frame = n * tileset.columns (row-major stride).
const stride = tileset.columns;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    setTilemapTile(tilemap, c, r, r * stride);
  }
}

function enterFrame(): void {
  render(tilemap);
  requestAnimationFrame(enterFrame);
}

enterFrame();
