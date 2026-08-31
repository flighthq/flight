import type { Node2D } from '@flighthq/sdk';
import {
  addNodeChild,
  createCamera2D,
  createDisplayObject,
  createImageResource,
  createMatrix,
  createPixelArtSampler,
  createSprite,
  createTexture,
  createTextureAtlasFromGrid,
  createTilemap,
  createVector2,
  getCamera2DViewMatrix,
  getTilemapColumnRowAtPoint,
  getTilemapTile,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  unprojectCamera2DPoint,
  zoomCamera2DAtScreenPoint,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const TILE_SIZE = 32;
const TILE_COUNT = 8;
const MAP_COLUMNS = 72;
const MAP_ROWS = 54;
const MAP_WIDTH = MAP_COLUMNS * TILE_SIZE;
const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;
const CAMERA_SPEED = 520;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.4;

const TILE_NAMES = ['meadow', 'water', 'shore', 'rock', 'trail', 'snow', 'lava', 'forest'] as const;
const TILE_COLORS: readonly (readonly [string, string])[] = [
  ['#3f8f4f', '#27713a'],
  ['#2474cc', '#1659aa'],
  ['#d9b85d', '#ad8c3e'],
  ['#68717d', '#454d58'],
  ['#9b6b43', '#724a2f'],
  ['#e8edf2', '#bcc8d2'],
  ['#dc3c20', '#ffb31a'],
  ['#235d39', '#123d28'],
];

function createTilesetCanvas(): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  surface.width = TILE_SIZE * TILE_COUNT;
  surface.height = TILE_SIZE;
  const context = surface.getContext('2d')!;

  for (let id = 0; id < TILE_COUNT; id++) {
    const x = id * TILE_SIZE;
    const [base, accent] = TILE_COLORS[id];
    context.fillStyle = base;
    context.fillRect(x, 0, TILE_SIZE, TILE_SIZE);
    context.strokeStyle = accent;
    context.lineWidth = 1.5;

    if (id === 0) {
      context.fillStyle = accent;
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
          context.fillRect(x + 4 + column * 8 + (row & 1) * 2, 4 + row * 8, 2, 4);
        }
      }
    } else if (id === 1) {
      for (let row = 0; row < 3; row++) {
        const y = 7 + row * 10;
        context.beginPath();
        context.moveTo(x, y);
        context.quadraticCurveTo(x + 8, y - 4, x + 16, y);
        context.quadraticCurveTo(x + 24, y + 4, x + 32, y);
        context.stroke();
      }
    } else if (id === 2) {
      context.fillStyle = accent;
      for (let dot = 0; dot < 10; dot++) {
        context.fillRect(x + 3 + ((dot * 11) % 27), 3 + ((dot * 7) % 25), 2, 2);
      }
    } else if (id === 3 || id === 5) {
      context.beginPath();
      context.moveTo(x + 2, 9);
      context.lineTo(x + 12, 5);
      context.lineTo(x + 22, 11);
      context.lineTo(x + 31, 7);
      context.moveTo(x + 4, 25);
      context.lineTo(x + 15, 18);
      context.lineTo(x + 28, 24);
      context.stroke();
    } else if (id === 4) {
      context.beginPath();
      context.moveTo(x, 20);
      context.bezierCurveTo(x + 8, 8, x + 22, 27, x + 32, 12);
      context.lineWidth = 5;
      context.stroke();
    } else if (id === 6) {
      context.fillStyle = accent;
      for (let spark = 0; spark < 8; spark++) {
        context.fillRect(x + 4 + ((spark * 13) % 25), 4 + ((spark * 9) % 23), 3, 3);
      }
    } else {
      context.fillStyle = accent;
      for (let tree = 0; tree < 4; tree++) {
        const treeX = x + 5 + (tree % 2) * 15;
        const treeY = 5 + Math.floor(tree / 2) * 15;
        context.beginPath();
        context.moveTo(treeX + 5, treeY);
        context.lineTo(treeX, treeY + 10);
        context.lineTo(treeX + 10, treeY + 10);
        context.closePath();
        context.fill();
      }
    }

    context.strokeStyle = 'rgba(10, 24, 34, 0.16)';
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  }

  return surface;
}

function createTerrainTiles(): Int16Array {
  const tiles = new Int16Array(MAP_COLUMNS * MAP_ROWS);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let column = 0; column < MAP_COLUMNS; column++) {
      const nx = (column - MAP_COLUMNS * 0.5) / (MAP_COLUMNS * 0.5);
      const ny = (row - MAP_ROWS * 0.5) / (MAP_ROWS * 0.5);
      const elevation =
        0.94 - Math.sqrt(nx * nx + ny * ny * 1.22) + Math.sin(column * 0.27) * 0.08 + Math.cos(row * 0.31) * 0.07;
      const moisture = Math.sin(column * 0.19 + row * 0.11) + Math.cos(row * 0.23 - column * 0.07);
      let tile = elevation < 0.08 ? 1 : elevation < 0.17 ? 2 : elevation > 0.71 ? 5 : elevation > 0.55 ? 3 : 0;

      if (tile === 0 && moisture > 0.9) tile = 7;
      const trailRow = MAP_ROWS * 0.58 + Math.sin(column * 0.16) * 3.5;
      if (tile !== 1 && tile !== 6 && Math.abs(row - trailRow) < 1.15) tile = 4;

      const craterX = column - MAP_COLUMNS * 0.58;
      const craterY = row - MAP_ROWS * 0.37;
      const craterDistance = Math.sqrt(craterX * craterX + craterY * craterY);
      if (craterDistance < 3.2) tile = 6;
      else if (craterDistance < 5.1) tile = 3;

      tiles[row * MAP_COLUMNS + column] = tile;
    }
  }
  return tiles;
}

function createSelectionCanvas(): HTMLCanvasElement {
  const surface = document.createElement('canvas');
  surface.width = TILE_SIZE;
  surface.height = TILE_SIZE;
  const context = surface.getContext('2d')!;
  context.fillStyle = 'rgba(255, 224, 96, 0.2)';
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  context.strokeStyle = '#ffe45e';
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
  return surface;
}

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const world = createDisplayObject();
addNodeChild(root, world);

const texture = createTexture({
  dimension: '2d',
  sampler: createPixelArtSampler(),
  source: createImageResource(createTilesetCanvas()),
});
const atlas = createTextureAtlasFromGrid(
  {
    columns: TILE_COUNT,
    frameHeight: TILE_SIZE,
    frameWidth: TILE_SIZE,
    imageFile: '',
    imageHeight: TILE_SIZE,
    imageWidth: TILE_SIZE * TILE_COUNT,
    rows: 1,
  },
  texture,
);
const tilemap = createTilemap({
  data: {
    atlas,
    columns: MAP_COLUMNS,
    rows: MAP_ROWS,
    tileHeight: TILE_SIZE,
    tileWidth: TILE_SIZE,
    tiles: createTerrainTiles(),
  },
});
addNodeChild(world, tilemap);

const cursor = createSprite({
  data: {
    texture: createTexture({
      dimension: '2d',
      sampler: createPixelArtSampler(),
      source: createImageResource(createSelectionCanvas()),
    }),
  },
});
addNodeChild(world, cursor);

const camera = createCamera2D(CANVAS_WIDTH, CANVAS_HEIGHT, {
  x: MAP_WIDTH * 0.5,
  y: MAP_HEIGHT * 0.48,
  zoom: 1,
});
const viewMatrix = createMatrix();
const worldPoint = createVector2();
const pickedCell = createVector2();
const keysDown = new Set<string>();
const hud = document.getElementById('hud');
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

let pointerScreenX = CANVAS_WIDTH * 0.5;
let pointerScreenY = CANVAS_HEIGHT * 0.5;
let dragging = false;
let dragPointerId = -1;
let previousPointerX = 0;
let previousPointerY = 0;
let previousTime = performance.now();

function clampCamera(): void {
  const halfWidth = CANVAS_WIDTH / (camera.zoom * 2);
  const halfHeight = CANVAS_HEIGHT / (camera.zoom * 2);
  camera.x = Math.max(halfWidth, Math.min(MAP_WIDTH - halfWidth, camera.x));
  camera.y = Math.max(halfHeight, Math.min(MAP_HEIGHT - halfHeight, camera.y));
}

function updateCursor(): void {
  unprojectCamera2DPoint(camera, pointerScreenX, pointerScreenY, worldPoint);
  const picked = getTilemapColumnRowAtPoint(pickedCell, tilemap, worldPoint.x, worldPoint.y);
  cursor.visible = picked;
  invalidateNodeAppearance(cursor);
  if (!picked) {
    if (hud !== null) hud.textContent = 'WASD / arrows pan • drag to explore • wheel zoom • no tile selected';
    return;
  }

  const column = pickedCell.x;
  const row = pickedCell.y;
  cursor.x = column * TILE_SIZE;
  cursor.y = row * TILE_SIZE;
  invalidateNodeLocalTransform(cursor);
  const tile = getTilemapTile(tilemap, column, row);
  if (hud !== null) {
    hud.textContent = `WASD / arrows pan • drag to explore • wheel zoom • ${TILE_NAMES[tile]} (${column}, ${row})`;
  }
}

function updateCamera(deltaTime: number): void {
  let horizontal = 0;
  let vertical = 0;
  if (keysDown.has('a') || keysDown.has('arrowleft')) horizontal -= 1;
  if (keysDown.has('d') || keysDown.has('arrowright')) horizontal += 1;
  if (keysDown.has('w') || keysDown.has('arrowup')) vertical -= 1;
  if (keysDown.has('s') || keysDown.has('arrowdown')) vertical += 1;
  if (horizontal !== 0 && vertical !== 0) {
    horizontal *= Math.SQRT1_2;
    vertical *= Math.SQRT1_2;
  }
  camera.x += (horizontal * CAMERA_SPEED * deltaTime) / camera.zoom;
  camera.y += (vertical * CAMERA_SPEED * deltaTime) / camera.zoom;
  clampCamera();

  getCamera2DViewMatrix(camera, viewMatrix);
  world.scaleX = viewMatrix.a;
  world.skewY = viewMatrix.b;
  world.skewX = viewMatrix.c;
  world.scaleY = viewMatrix.d;
  world.x = viewMatrix.tx;
  world.y = viewMatrix.ty;
  invalidateNodeLocalTransform(world);
}

function updatePointerScreenPosition(event: PointerEvent | WheelEvent): void {
  const bounds = canvas.getBoundingClientRect();
  pointerScreenX = ((event.clientX - bounds.left) / bounds.width) * CANVAS_WIDTH;
  pointerScreenY = ((event.clientY - bounds.top) / bounds.height) * CANVAS_HEIGHT;
}

window.addEventListener('keydown', (event: KeyboardEvent) => {
  keysDown.add(event.key.toLowerCase());
});
window.addEventListener('keyup', (event: KeyboardEvent) => {
  keysDown.delete(event.key.toLowerCase());
});

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  dragging = true;
  dragPointerId = event.pointerId;
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  updatePointerScreenPosition(event);
});
canvas.addEventListener('pointermove', (event: PointerEvent) => {
  updatePointerScreenPosition(event);
  if (!dragging || event.pointerId !== dragPointerId) return;
  const bounds = canvas.getBoundingClientRect();
  camera.x -= ((event.clientX - previousPointerX) * CANVAS_WIDTH) / (bounds.width * camera.zoom);
  camera.y -= ((event.clientY - previousPointerY) * CANVAS_HEIGHT) / (bounds.height * camera.zoom);
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  clampCamera();
});
canvas.addEventListener('pointerup', (event: PointerEvent) => {
  if (event.pointerId !== dragPointerId) return;
  dragging = false;
  dragPointerId = -1;
  canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener('pointercancel', () => {
  dragging = false;
  dragPointerId = -1;
});
canvas.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    event.preventDefault();
    updatePointerScreenPosition(event);
    const zoomFactor = Math.exp(-event.deltaY * 0.001);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * zoomFactor));
    zoomCamera2DAtScreenPoint(camera, pointerScreenX, pointerScreenY, zoom);
    clampCamera();
  },
  { passive: false },
);

function enterFrame(now: number): void {
  const deltaTime = captureMode ? 1 / 60 : Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  updateCamera(deltaTime);
  updateCursor();
  render(root as Node2D);
  if (!captureMode) requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
