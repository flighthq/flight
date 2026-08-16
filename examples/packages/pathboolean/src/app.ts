import type { Path, Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapePath,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import { appendPathCircle, appendPathRoundRectangle, createPath } from '@flighthq/sdk/scene2d';
import { differencePaths, intersectPaths, unionPaths, xorPaths } from '@flighthq/sdk/scene2d';

import { canvas, render, scale } from './render';

const CELL_W = 400;
const CELL_H = 300;

const FILL_COLORS: readonly number[] = [
  0x2980b9ff, // union: blue
  0x27ae60ff, // intersect: green
  0xc0392bff, // difference: red
  0x8e44adff, // xor: purple
];

const OUTLINE_COLOR_A = 0x34495eff;
const OUTLINE_COLOR_B = 0xe67e22ff;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Source shape center offsets (relative to each cell center). Shape A is left of center, shape B
// is right of center, overlapping in the middle.
let shapeAOffsetX = -40;
let shapeAOffsetY = 0;
let shapeBOffsetX = 40;
let shapeBOffsetY = 0;

// Grid cells: [row, col] -> [Union, Intersect, Difference, XOR].
const labels = ['Union', 'Intersect', 'Difference (A - B)', 'XOR'];
const resultShapes: Shape[] = [];
const outlineShapes: Shape[] = [];

for (let i = 0; i < 4; i++) {
  const col = i % 2;
  const row = Math.floor(i / 2);

  const resultShape = createShape();
  resultShape.x = col * CELL_W;
  resultShape.y = row * CELL_H;
  invalidateNodeLocalTransform(resultShape);
  addNodeChild(root, resultShape);
  resultShapes.push(resultShape);

  const outlineShape = createShape();
  outlineShape.x = col * CELL_W;
  outlineShape.y = row * CELL_H;
  invalidateNodeLocalTransform(outlineShape);
  addNodeChild(root, outlineShape);
  outlineShapes.push(outlineShape);
}

function buildSourcePaths(): { pathA: Path; pathB: Path } {
  const cx = CELL_W / 2;
  const cy = CELL_H / 2;

  const pathA = createPath();
  appendPathCircle(pathA, cx + shapeAOffsetX, cy + shapeAOffsetY, 80);

  const pathB = createPath();
  appendPathRoundRectangle(pathB, cx + shapeBOffsetX - 70, cy + shapeBOffsetY - 60, 140, 120, 16);

  return { pathA, pathB };
}

function drawOutlines(shape: Shape, pathA: Readonly<Path>, pathB: Readonly<Path>): void {
  appendShapeLineStyle(shape, 2, OUTLINE_COLOR_A, 0.5);
  appendShapePath(shape, pathA.commands, pathA.data, pathA.winding);
  appendShapeEndFill(shape);

  appendShapeLineStyle(shape, 2, OUTLINE_COLOR_B, 0.5);
  appendShapePath(shape, pathB.commands, pathB.data, pathB.winding);
  appendShapeEndFill(shape);
}

function drawBooleanResult(shape: Shape, resultPath: Readonly<Path>, color: number): void {
  appendShapeBeginFill(shape, color, 0.7);
  appendShapePath(shape, resultPath.commands, resultPath.data, resultPath.winding);
  appendShapeEndFill(shape);
}

function rebuild(): void {
  const { pathA, pathB } = buildSourcePaths();

  const operations = [unionPaths, intersectPaths, differencePaths, xorPaths];

  for (let i = 0; i < 4; i++) {
    const resultPath = operations[i](pathA, pathB);

    clearShapeCommands(resultShapes[i]);
    drawBooleanResult(resultShapes[i], resultPath, FILL_COLORS[i]);
    invalidateNodeAppearance(resultShapes[i]);

    clearShapeCommands(outlineShapes[i]);
    drawOutlines(outlineShapes[i], pathA, pathB);
    invalidateNodeAppearance(outlineShapes[i]);
  }
}

rebuild();

// Drag interaction: detect which source shape the pointer is near and drag it.
const canvasEl = canvas;
let dragging: 'a' | 'b' | null = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;
let dragCellCol = 0;
let dragCellRow = 0;

function canvasToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * (CELL_W * 2),
    y: ((clientY - rect.top) / rect.height) * (CELL_H * 2),
  };
}

function distToShapeCenter(wx: number, wy: number, offsetX: number, offsetY: number): number {
  const cx = CELL_W / 2 + offsetX;
  const cy = CELL_H / 2 + offsetY;
  const dx = wx - cx;
  const dy = wy - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

canvasEl.addEventListener('pointerdown', (e: PointerEvent) => {
  const world = canvasToWorld(e.clientX, e.clientY);
  dragCellCol = Math.min(1, Math.floor(world.x / CELL_W));
  dragCellRow = Math.min(1, Math.floor(world.y / CELL_H));
  const x = world.x - dragCellCol * CELL_W;
  const y = world.y - dragCellRow * CELL_H;
  const distA = distToShapeCenter(x, y, shapeAOffsetX, shapeAOffsetY);
  const distB = distToShapeCenter(x, y, shapeBOffsetX, shapeBOffsetY);

  // Pick the closer source outline in whichever result cell was clicked.
  if (distA < 100 && distA <= distB) {
    dragging = 'a';
    dragStartX = x;
    dragStartY = y;
    dragStartOffsetX = shapeAOffsetX;
    dragStartOffsetY = shapeAOffsetY;
    canvasEl.setPointerCapture(e.pointerId);
  } else if (distB < 100) {
    dragging = 'b';
    dragStartX = x;
    dragStartY = y;
    dragStartOffsetX = shapeBOffsetX;
    dragStartOffsetY = shapeBOffsetY;
    canvasEl.setPointerCapture(e.pointerId);
  }
});

canvasEl.addEventListener('pointermove', (e: PointerEvent) => {
  if (dragging === null) return;
  const world = canvasToWorld(e.clientX, e.clientY);
  const x = world.x - dragCellCol * CELL_W;
  const y = world.y - dragCellRow * CELL_H;
  const dx = x - dragStartX;
  const dy = y - dragStartY;

  if (dragging === 'a') {
    shapeAOffsetX = dragStartOffsetX + dx;
    shapeAOffsetY = dragStartOffsetY + dy;
  } else {
    shapeBOffsetX = dragStartOffsetX + dx;
    shapeBOffsetY = dragStartOffsetY + dy;
  }

  rebuild();
});

function stopDragging(): void {
  dragging = null;
}

canvasEl.addEventListener('pointerup', stopDragging);
canvasEl.addEventListener('pointercancel', stopDragging);

// Overlay labels using DOM elements positioned over the canvas.
function addLabel(text: string, col: number, row: number): void {
  const label = document.createElement('div');
  label.textContent = text;
  label.style.position = 'absolute';
  label.style.left = `${col * CELL_W + 10}px`;
  label.style.top = `${row * CELL_H + 8}px`;
  label.style.fontFamily = 'system-ui, sans-serif';
  label.style.fontSize = '14px';
  label.style.fontWeight = '600';
  label.style.color = '#333';
  label.style.pointerEvents = 'none';
  label.style.userSelect = 'none';
  canvasEl.parentElement!.appendChild(label);
}

canvasEl.parentElement!.style.position = 'relative';
canvasEl.parentElement!.style.display = 'inline-block';

for (let i = 0; i < 4; i++) {
  addLabel(labels[i], i % 2, Math.floor(i / 2));
}

// Render loop.
function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
