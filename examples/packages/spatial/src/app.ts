import type { Shape, SpatialAabb, SpatialObjectId, SpatialPair } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import {
  createSpatialIndex,
  createUniformGridSpatialBackend,
  insertSpatialObject,
  querySpatialPairs,
  querySpatialPoint,
  querySpatialRay,
  querySpatialRegion,
  updateSpatialObject,
} from '@flighthq/spatial';

import { render, scale } from './render';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

const COLOR_IDLE = 0x4488cc;
const COLOR_OVERLAP = 0xcc4444;
const COLOR_POINT_HIT = 0x44cc44;
const COLOR_RAY_HIT = 0xcccc44;
const COLOR_REGION_HIT = 0x44cccc;
const COLOR_OUTLINE = 0x335577;

const OBJECT_COUNT = 20;
const MOVING_COUNT = 5;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const index = createSpatialIndex(createUniformGridSpatialBackend(100));

interface SpatialObject {
  id: SpatialObjectId;
  bounds: SpatialAabb;
  shape: Shape;
  vx: number;
  vy: number;
}

const objects: SpatialObject[] = [];

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

for (let i = 0; i < OBJECT_COUNT; i++) {
  const w = randomRange(30, 80);
  const h = randomRange(20, 60);
  const x = randomRange(10, CANVAS_WIDTH - w - 10);
  const y = randomRange(40, CANVAS_HEIGHT - h - 50);
  const bounds: SpatialAabb = { minX: x, minY: y, maxX: x + w, maxY: y + h };

  const shape = createShape();
  addNodeChild(root, shape);

  const isMoving = i < MOVING_COUNT;
  const speed = 30;

  objects.push({
    id: i,
    bounds,
    shape,
    vx: isMoving ? randomRange(-speed, speed) : 0,
    vy: isMoving ? randomRange(-speed, speed) : 0,
  });

  insertSpatialObject(index, i, bounds);
}

// Query visualization overlay: draws region box, ray line, or point marker.
const queryOverlay = createShape();
addNodeChild(root, queryOverlay);

// HUD label.
const hudLabel = createTextLabel();
hudLabel.data.text = 'Click: point query | R: ray query | Q: region query';
hudLabel.data.textFormat = { size: 13, color: 0x888888 };
hudLabel.x = 10;
hudLabel.y = 6;
invalidateNodeLocalTransform(hudLabel);
addNodeChild(root, hudLabel);

const modeLabel = createTextLabel();
modeLabel.data.text = 'Mode: Pairs';
modeLabel.data.textFormat = { size: 14, color: 0xcccccc };
modeLabel.x = 10;
modeLabel.y = CANVAS_HEIGHT - 30;
invalidateNodeLocalTransform(modeLabel);
addNodeChild(root, modeLabel);

// Interaction state.
let mouseX = CANVAS_WIDTH / 2;
let mouseY = CANVAS_HEIGHT / 2;

type QueryMode = 'pairs' | 'point' | 'ray' | 'region';
let activeMode: QueryMode = 'pairs';

const canvasElement = document.querySelector('canvas')!;

canvasElement.addEventListener('pointermove', (e: PointerEvent) => {
  const rect = canvasElement.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
  mouseY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
});

canvasElement.addEventListener('pointerdown', () => {
  activeMode = 'point';
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const key = e.key.toLowerCase();
  if (key === 'r') activeMode = 'ray';
  if (key === 'q') activeMode = 'region';
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
  const key = e.key.toLowerCase();
  if (key === 'r' || key === 'q') activeMode = 'pairs';
});

canvasElement.addEventListener('pointerup', () => {
  activeMode = 'pairs';
});

// Reusable query output arrays.
const pairsOut: SpatialPair[] = [];
const idsOut: SpatialObjectId[] = [];

function redrawObject(obj: SpatialObject, color: number): void {
  const b = obj.bounds;
  clearShapeCommands(obj.shape);
  appendShapeBeginFill(obj.shape, color, 0.5);
  appendShapeLineStyle(obj.shape, 1, COLOR_OUTLINE);
  appendShapeRectangle(obj.shape, b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  appendShapeEndFill(obj.shape);
  invalidateNodeLocalTransform(obj.shape);
}

function drawQueryOverlay(): void {
  clearShapeCommands(queryOverlay);

  if (activeMode === 'point') {
    // Draw a small crosshair at the mouse position.
    appendShapeLineStyle(queryOverlay, 2, COLOR_POINT_HIT);
    appendShapeMoveTo(queryOverlay, mouseX - 8, mouseY);
    appendShapeLineTo(queryOverlay, mouseX + 8, mouseY);
    appendShapeMoveTo(queryOverlay, mouseX, mouseY - 8);
    appendShapeLineTo(queryOverlay, mouseX, mouseY + 8);
  } else if (activeMode === 'ray') {
    // Draw a ray from the left edge toward the mouse position.
    const dx = mouseX;
    const dy = mouseY - CANVAS_HEIGHT / 2;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = dx / len;
      const ny = dy / len;
      const endX = nx * CANVAS_WIDTH * 1.5;
      const endY = CANVAS_HEIGHT / 2 + ny * CANVAS_WIDTH * 1.5;
      appendShapeLineStyle(queryOverlay, 1, COLOR_RAY_HIT);
      appendShapeMoveTo(queryOverlay, 0, CANVAS_HEIGHT / 2);
      appendShapeLineTo(queryOverlay, endX, endY);
    }
  } else if (activeMode === 'region') {
    // Draw a 100x100 query box centered at mouse.
    appendShapeBeginFill(queryOverlay, COLOR_REGION_HIT, 0.15);
    appendShapeLineStyle(queryOverlay, 1, COLOR_REGION_HIT);
    appendShapeRectangle(queryOverlay, mouseX - 50, mouseY - 50, 100, 100);
    appendShapeEndFill(queryOverlay);
  }

  invalidateNodeLocalTransform(queryOverlay);
}

function updateModeLabel(resultCount: number): void {
  const modeNames: Record<QueryMode, string> = {
    pairs: 'Pairs',
    point: 'Point',
    ray: 'Ray',
    region: 'Region',
  };
  modeLabel.data.text = 'Mode: ' + modeNames[activeMode] + '  Hits: ' + resultCount;
  invalidateNodeAppearance(modeLabel);
}

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // Move the first few objects and bounce them off the edges.
  for (let i = 0; i < MOVING_COUNT; i++) {
    const obj = objects[i];
    const w = obj.bounds.maxX - obj.bounds.minX;
    const h = obj.bounds.maxY - obj.bounds.minY;

    obj.bounds.minX += obj.vx * dt;
    obj.bounds.minY += obj.vy * dt;
    obj.bounds.maxX = obj.bounds.minX + w;
    obj.bounds.maxY = obj.bounds.minY + h;

    if (obj.bounds.minX < 0) {
      obj.bounds.minX = 0;
      obj.bounds.maxX = w;
      obj.vx = Math.abs(obj.vx);
    }
    if (obj.bounds.maxX > CANVAS_WIDTH) {
      obj.bounds.maxX = CANVAS_WIDTH;
      obj.bounds.minX = CANVAS_WIDTH - w;
      obj.vx = -Math.abs(obj.vx);
    }
    if (obj.bounds.minY < 0) {
      obj.bounds.minY = 0;
      obj.bounds.maxY = h;
      obj.vy = Math.abs(obj.vy);
    }
    if (obj.bounds.maxY > CANVAS_HEIGHT) {
      obj.bounds.maxY = CANVAS_HEIGHT;
      obj.bounds.minY = CANVAS_HEIGHT - h;
      obj.vy = -Math.abs(obj.vy);
    }

    updateSpatialObject(index, obj.id, obj.bounds);
  }

  // Determine which objects to highlight based on the active query mode.
  const highlightSet = new Set<SpatialObjectId>();
  let resultCount = 0;

  if (activeMode === 'pairs') {
    querySpatialPairs(index, pairsOut);
    resultCount = pairsOut.length;
    for (let i = 0; i < pairsOut.length; i++) {
      highlightSet.add(pairsOut[i].a);
      highlightSet.add(pairsOut[i].b);
    }
  } else if (activeMode === 'point') {
    querySpatialPoint(index, mouseX, mouseY, idsOut);
    resultCount = idsOut.length;
    for (let i = 0; i < idsOut.length; i++) {
      highlightSet.add(idsOut[i]);
    }
  } else if (activeMode === 'ray') {
    const dx = mouseX;
    const dy = mouseY - CANVAS_HEIGHT / 2;
    querySpatialRay(index, 0, CANVAS_HEIGHT / 2, dx, dy, idsOut);
    resultCount = idsOut.length;
    for (let i = 0; i < idsOut.length; i++) {
      highlightSet.add(idsOut[i]);
    }
  } else if (activeMode === 'region') {
    const region: SpatialAabb = {
      minX: mouseX - 50,
      minY: mouseY - 50,
      maxX: mouseX + 50,
      maxY: mouseY + 50,
    };
    querySpatialRegion(index, region, idsOut);
    resultCount = idsOut.length;
    for (let i = 0; i < idsOut.length; i++) {
      highlightSet.add(idsOut[i]);
    }
  }

  // Choose highlight color based on mode.
  const hitColor =
    activeMode === 'point'
      ? COLOR_POINT_HIT
      : activeMode === 'ray'
        ? COLOR_RAY_HIT
        : activeMode === 'region'
          ? COLOR_REGION_HIT
          : COLOR_OVERLAP;

  for (let i = 0; i < objects.length; i++) {
    redrawObject(objects[i], highlightSet.has(objects[i].id) ? hitColor : COLOR_IDLE);
  }

  drawQueryOverlay();
  updateModeLabel(resultCount);

  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
