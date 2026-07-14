import type { DisplayObject } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createImageResource,
  createTilemap,
  createTilesetFromImageResource,
  invalidateNodeAppearance,
  resizeTilemap,
  setTilemapTile,
} from '@flighthq/sdk';

import { render, scale } from './render';

const TILE_SIZE = 32;
const TILE_COUNT = 8;
const MAP_COLUMNS = 25;
const MAP_ROWS = 19;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const TILE_COLORS: [string, string][] = [
  ['#3a7d44', '#2d6535'], // grass
  ['#2563eb', '#1d4ed8'], // water
  ['#d4a843', '#b8922e'], // sand
  ['#6b7280', '#4b5563'], // stone
  ['#8b5e3c', '#6d4a2e'], // dirt
  ['#e8e8e8', '#d1d5db'], // snow
  ['#dc2626', '#ea580c'], // lava
  ['#1f2937', '#111827'], // void
];

function createTilesetCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_SIZE * TILE_COUNT;
  c.height = TILE_SIZE;
  const ctx = c.getContext('2d')!;

  for (let i = 0; i < TILE_COUNT; i++) {
    const x = i * TILE_SIZE;
    const [base, accent] = TILE_COLORS[i];

    ctx.fillStyle = base;
    ctx.fillRect(x, 0, TILE_SIZE, TILE_SIZE);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;

    if (i === 0) {
      for (let dy = 4; dy < TILE_SIZE; dy += 8) {
        for (let dx = 4; dx < TILE_SIZE; dx += 8) {
          ctx.fillStyle = accent;
          ctx.fillRect(x + dx, dy, 2, 3);
        }
      }
    } else if (i === 1) {
      ctx.beginPath();
      for (let w = 0; w < 3; w++) {
        const wy = 8 + w * 10;
        ctx.moveTo(x, wy);
        ctx.quadraticCurveTo(x + 8, wy - 4, x + 16, wy);
        ctx.quadraticCurveTo(x + 24, wy + 4, x + 32, wy);
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (i === 3) {
      ctx.beginPath();
      ctx.moveTo(x + 4, 4);
      ctx.lineTo(x + 28, 8);
      ctx.moveTo(x + 2, 16);
      ctx.lineTo(x + 30, 20);
      ctx.moveTo(x + 6, 26);
      ctx.lineTo(x + 26, 30);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (i === 6) {
      ctx.fillStyle = '#fbbf24';
      for (let s = 0; s < 4; s++) {
        const sx = x + 4 + (s % 2) * 16 + Math.sin(s * 2.1) * 4;
        const sy = 4 + Math.floor(s / 2) * 16 + Math.cos(s * 1.7) * 4;
        ctx.fillRect(sx, sy, 3, 3);
      }
    }
  }

  return c;
}

const tilesetCanvas = createTilesetCanvas();
const imageResource = createImageResource(tilesetCanvas);
const tileset = createTilesetFromImageResource(imageResource, TILE_SIZE, TILE_SIZE);

const tilemap = createTilemap();
resizeTilemap(tilemap, MAP_COLUMNS, MAP_ROWS);
tilemap.data.tileset = tileset;

// Procedural landscape: snow peaks at top, stone mountains, grass plains, sand shore, water.
for (let row = 0; row < MAP_ROWS; row++) {
  for (let col = 0; col < MAP_COLUMNS; col++) {
    let id: number;
    const heightNoise = Math.sin(col * 0.4) * 1.5 + Math.cos(col * 0.7 + 1) * 1;

    if (row < 3 + heightNoise) {
      id = 5; // snow
    } else if (row < 5 + heightNoise) {
      id = 3; // stone
    } else if (row < 14 + heightNoise * 0.5) {
      id = 0; // grass
      if ((col + row) % 7 === 0) id = 4; // occasional dirt
    } else if (row < 15 + heightNoise * 0.3) {
      id = 2; // sand
    } else {
      id = 1; // water
      if (row === MAP_ROWS - 1 && col % 5 === 2) id = 7; // deep void
    }

    // Place a lava pool near center.
    const cx = MAP_COLUMNS / 2;
    const cy = 8;
    const dist = Math.sqrt((col - cx) ** 2 + (row - cy) ** 2);
    if (dist < 2.5) id = 6;

    setTilemapTile(tilemap, col, row, id);
  }
}

invalidateNodeAppearance(tilemap);
addNodeChild(root, tilemap);

function enterFrame(): void {
  render(root as DisplayObject);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
