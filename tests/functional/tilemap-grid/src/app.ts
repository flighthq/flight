// tilemap-grid — validates the Tilemap atlas-batch render path: a grid of cells, each cell drawing one tile
// region sampled from a shared tileset atlas, all under a single node transform.
//
// Tilemaps are the atlas-based batch renderer (one image, many sub-rect blits per frame) with no prior
// functional coverage. The scene builds a procedural 2-tile atlas (tile 0 = red, tile 1 = green) entirely
// in a canvas — no external assets — slices it into a Tileset, lays out a red/green checkerboard across a
// COLS×ROWS Tilemap, and positions it. The oracle samples the center of several cells and proves each
// carries the color of the tile id it was assigned: tile 0 cells are red, tile 1 cells are green. This is
// inherently visual — it exercises per-tile source-rect selection and destination placement that jsdom
// cannot confirm.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createTilemap,
  createTilesetFromImageResource,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  setTilemapTile,
  TilemapKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Procedural atlas: a 2-wide × 1-tall grid of solid-color tiles, each TILE_W × TILE_H.
// Tile id 0 = red (left), tile id 1 = green (right).
const TILE_W = 64;
const TILE_H = 64;

// Tilemap layout: a small checkerboard of red/green cells.
const COLS = 4;
const ROWS = 3;
const MAP_X = 200; // top-left of the tilemap in logical pixels
const MAP_Y = 120;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [TilemapKind],
});

// Build the atlas image in a canvas: [red | green], side by side.
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = TILE_W * 2;
atlasCanvas.height = TILE_H;
const ctx = atlasCanvas.getContext('2d')!;
ctx.fillStyle = '#ff0000';
ctx.fillRect(0, 0, TILE_W, TILE_H);
ctx.fillStyle = '#00ff00';
ctx.fillRect(TILE_W, 0, TILE_W, TILE_H);

// Slice the atlas into a Tileset: TILE_W×TILE_H grid → tile 0 (red), tile 1 (green).
const tileset = createTilesetFromImageResource(createImageResourceFromCanvas(atlasCanvas), TILE_W, TILE_H);

const root = createDisplayContainer();

const tilemap = createTilemap({ data: { columns: COLS, rows: ROWS, tileset } });
tilemap.x = MAP_X;
tilemap.y = MAP_Y;
invalidateNodeLocalTransform(tilemap);

// Checkerboard: (col + row) even → red (tile 0), odd → green (tile 1).
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    setTilemapTile(tilemap, col, row, (col + row) % 2 === 0 ? 0 : 1);
  }
}
addNodeChild(root, tilemap);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Center of cell (col,row) in logical pixels.
  const cellCenterX = (col: number): number => MAP_X + col * TILE_W + TILE_W / 2;
  const cellCenterY = (row: number): number => MAP_Y + row * TILE_H + TILE_H / 2;

  let redCells = 0;
  let greenCells = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const expectRed = (col + row) % 2 === 0;
      const rgb = at(cellCenterX(col), cellCenterY(row));
      if (expectRed) {
        if (!isRed(rgb)) {
          throw new Error(`[tilemap-grid] cell (${col},${row}) expected red tile — got #${hex(rgb)}`);
        }
        redCells++;
      } else {
        if (!isGreen(rgb)) {
          throw new Error(`[tilemap-grid] cell (${col},${row}) expected green tile — got #${hex(rgb)}`);
        }
        greenCells++;
      }
    }
  }

  // Confirm the checkerboard actually placed both tiles (at least two of each), not one color everywhere.
  if (redCells < 2) {
    throw new Error(`[tilemap-grid] expected at least 2 red cells, found ${redCells}`);
  }
  if (greenCells < 2) {
    throw new Error(`[tilemap-grid] expected at least 2 green cells, found ${greenCells}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 90 && channel(rgb, 8) > 180 && channel(rgb, 0) < 90;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
