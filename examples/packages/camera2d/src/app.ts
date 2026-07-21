import {
  createCamera2D,
  getCamera2DParallaxPoint,
  getCamera2DViewMatrix,
  getCamera2DVisibleBounds,
  updateCamera2DFollow,
  zoomCamera2DAtScreenPoint,
} from '@flighthq/camera2d';
import type { Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePolygon,
  appendShapeRectangle,
  clearShapeCommands,
  createDisplayContainer,
  createRectangle,
  createShape,
  createTextLabel,
  createVector2,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { canvas, CANVAS_HEIGHT, CANVAS_WIDTH, render, scale } from './render';

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1800;
const PLAYER_SIZE = 24;
const PLAYER_SPEED = 300;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

const worldBounds = createRectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

const camera = createCamera2D(CANVAS_WIDTH, CANVAS_HEIGHT, {
  x: WORLD_WIDTH * 0.5,
  y: WORLD_HEIGHT * 0.5,
  zoom: 1,
});

const followOptions = {
  deadzoneHalfWidth: 60,
  deadzoneHalfHeight: 40,
  smoothTime: 0.15,
  worldBounds,
};

const playerX = WORLD_WIDTH * 0.5;
const playerY = WORLD_HEIGHT * 0.5;
const player = { x: playerX, y: playerY };

const keysDown = new Set<string>();

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

const rand = seededRandom(42);

interface LandmarkData {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  kind: 'rect' | 'circle';
}

function randomHslToRgb(hue: number): number {
  const s = 0.6;
  const l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);
  return (ri << 16) | (gi << 8) | bi;
}

const landmarkData: LandmarkData[] = [];
for (let i = 0; i < 60; i++) {
  const kind = rand() > 0.5 ? ('rect' as const) : ('circle' as const);
  const size = 20 + rand() * 80;
  landmarkData.push({
    x: 100 + rand() * (WORLD_WIDTH - 200),
    y: 100 + rand() * (WORLD_HEIGHT - 200),
    width: size,
    height: kind === 'circle' ? size : 20 + rand() * 80,
    color: randomHslToRgb(Math.floor(rand() * 360)),
    kind,
  });
}

interface ParallaxStar {
  x: number;
  y: number;
  radius: number;
  brightness: number;
}

interface ParallaxCloud {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ParallaxMountain {
  x: number;
  baseY: number;
  peakHeight: number;
  width: number;
}

const stars: ParallaxStar[] = [];
for (let i = 0; i < 80; i++) {
  stars.push({
    x: rand() * CANVAS_WIDTH,
    y: rand() * CANVAS_HEIGHT,
    radius: 1 + rand() * 2,
    brightness: 0.3 + rand() * 0.7,
  });
}

const clouds: ParallaxCloud[] = [];
for (let i = 0; i < 12; i++) {
  clouds.push({
    x: rand() * CANVAS_WIDTH,
    y: 50 + rand() * 200,
    width: 80 + rand() * 120,
    height: 30 + rand() * 40,
  });
}

const mountains: ParallaxMountain[] = [];
for (let i = 0; i < 8; i++) {
  mountains.push({
    x: rand() * CANVAS_WIDTH,
    baseY: CANVAS_HEIGHT,
    peakHeight: 100 + rand() * 200,
    width: 120 + rand() * 180,
  });
}

const parallaxOffset = createVector2();

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const starsContainer = createDisplayContainer();
addNodeChild(root, starsContainer);

const mountainsContainer = createDisplayContainer();
addNodeChild(root, mountainsContainer);

const cloudsContainer = createDisplayContainer();
addNodeChild(root, cloudsContainer);

const worldContainer = createDisplayContainer();
addNodeChild(root, worldContainer);

const hudContainer = createDisplayContainer();
addNodeChild(root, hudContainer);

const starsShape = createShape();
addNodeChild(starsContainer, starsShape);

const mountainsShape = createShape();
addNodeChild(mountainsContainer, mountainsShape);

const cloudsShape = createShape();
addNodeChild(cloudsContainer, cloudsShape);

const gridShape = createShape();
addNodeChild(worldContainer, gridShape);

const borderShape = createShape();
addNodeChild(worldContainer, borderShape);

const landmarkShapes: Shape[] = [];
for (const lm of landmarkData) {
  const shape = createShape();
  appendShapeBeginFill(shape, lm.color, 0.7);
  if (lm.kind === 'rect') {
    appendShapeRectangle(shape, lm.x - lm.width * 0.5, lm.y - lm.height * 0.5, lm.width, lm.height);
  } else {
    appendShapeCircle(shape, lm.x, lm.y, lm.width * 0.5);
  }
  appendShapeEndFill(shape);
  addNodeChild(worldContainer, shape);
  landmarkShapes.push(shape);
}

const playerShape = createShape();
addNodeChild(worldContainer, playerShape);

const visibleBoundsShape = createShape();
addNodeChild(worldContainer, visibleBoundsShape);

const hudBg = createShape();
appendShapeBeginFill(hudBg, 0x000000, 0.5);
appendShapeRectangle(hudBg, 8, 8, 260, 80);
appendShapeEndFill(hudBg);
addNodeChild(hudContainer, hudBg);

const cameraLabel = createTextLabel();
cameraLabel.data.textFormat = { size: 13, color: 0xffffff, font: 'monospace' };
cameraLabel.x = 16;
cameraLabel.y = 16;
invalidateNodeLocalTransform(cameraLabel);
addNodeChild(hudContainer, cameraLabel);

const playerLabel = createTextLabel();
playerLabel.data.textFormat = { size: 13, color: 0xffffff, font: 'monospace' };
playerLabel.x = 16;
playerLabel.y = 34;
invalidateNodeLocalTransform(playerLabel);
addNodeChild(hudContainer, playerLabel);

const controlsLabel = createTextLabel();
controlsLabel.data.text = 'WASD/Arrows: move  Scroll: zoom';
controlsLabel.data.textFormat = { size: 13, color: 0xffffff, font: 'monospace' };
controlsLabel.x = 16;
controlsLabel.y = 52;
invalidateNodeLocalTransform(controlsLabel);
addNodeChild(hudContainer, controlsLabel);

const legendLabel = createTextLabel();
legendLabel.data.text = 'Green = visible bounds  Red = world border';
legendLabel.data.textFormat = { size: 13, color: 0xffffff, font: 'monospace' };
legendLabel.x = 16;
legendLabel.y = 70;
invalidateNodeLocalTransform(legendLabel);
addNodeChild(hudContainer, legendLabel);

function buildGridShape(): void {
  clearShapeCommands(gridShape);
  appendShapeLineStyle(gridShape, 1, 0x64788c, 0.15);
  const gridSize = 100;
  for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
    appendShapeMoveTo(gridShape, x, 0);
    appendShapeLineTo(gridShape, x, WORLD_HEIGHT);
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
    appendShapeMoveTo(gridShape, 0, y);
    appendShapeLineTo(gridShape, WORLD_WIDTH, y);
  }
  appendShapeEndFill(gridShape);
  invalidateNodeAppearance(gridShape);
}

function buildBorderShape(): void {
  clearShapeCommands(borderShape);
  appendShapeLineStyle(borderShape, 3, 0xc85050, 0.5);
  appendShapeRectangle(borderShape, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  appendShapeEndFill(borderShape);
  invalidateNodeAppearance(borderShape);
}

buildGridShape();
buildBorderShape();

function rebuildStars(): void {
  clearShapeCommands(starsShape);
  for (const star of stars) {
    appendShapeBeginFill(starsShape, 0xffffd0, star.brightness);
    appendShapeCircle(starsShape, star.x, star.y, star.radius);
    appendShapeEndFill(starsShape);
  }
  invalidateNodeAppearance(starsShape);
}

function rebuildMountains(): void {
  clearShapeCommands(mountainsShape);
  for (const mt of mountains) {
    appendShapeBeginFill(mountainsShape, 0x3c5064, 0.6);
    appendShapePolygon(mountainsShape, [
      mt.x - mt.width * 0.5,
      mt.baseY,
      mt.x,
      mt.baseY - mt.peakHeight,
      mt.x + mt.width * 0.5,
      mt.baseY,
    ]);
    appendShapeEndFill(mountainsShape);
  }
  invalidateNodeAppearance(mountainsShape);
}

function rebuildClouds(): void {
  clearShapeCommands(cloudsShape);
  for (const cloud of clouds) {
    appendShapeBeginFill(cloudsShape, 0xc8d2e6, 0.4);
    appendShapeEllipse(
      cloudsShape,
      cloud.x - cloud.width * 0.5,
      cloud.y - cloud.height * 0.5,
      cloud.width,
      cloud.height,
    );
    appendShapeEndFill(cloudsShape);
  }
  invalidateNodeAppearance(cloudsShape);
}

rebuildStars();
rebuildMountains();
rebuildClouds();

let lastTime = performance.now();

window.addEventListener('keydown', (e: KeyboardEvent) => {
  keysDown.add(e.key);
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
  keysDown.delete(e.key);
});

const wheelTarget = canvas instanceof HTMLCanvasElement ? canvas : (canvas as HTMLElement);
wheelTarget.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    const rect = wheelTarget.getBoundingClientRect();
    const screenX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const screenY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom + direction * ZOOM_STEP * camera.zoom));
    zoomCamera2DAtScreenPoint(camera, screenX, screenY, newZoom);
  },
  { passive: false },
);

function updatePlayer(deltaTime: number): void {
  let dx = 0;
  let dy = 0;
  if (keysDown.has('ArrowLeft') || keysDown.has('a')) dx -= 1;
  if (keysDown.has('ArrowRight') || keysDown.has('d')) dx += 1;
  if (keysDown.has('ArrowUp') || keysDown.has('w')) dy -= 1;
  if (keysDown.has('ArrowDown') || keysDown.has('s')) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
  }

  player.x += dx * PLAYER_SPEED * deltaTime;
  player.y += dy * PLAYER_SPEED * deltaTime;

  player.x = Math.max(PLAYER_SIZE, Math.min(WORLD_WIDTH - PLAYER_SIZE, player.x));
  player.y = Math.max(PLAYER_SIZE, Math.min(WORLD_HEIGHT - PLAYER_SIZE, player.y));
}

const viewMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const visibleBounds = createRectangle();

function enterFrame(): void {
  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updatePlayer(deltaTime);
  updateCamera2DFollow(camera, player.x, player.y, deltaTime, followOptions);
  getCamera2DViewMatrix(camera, viewMatrix);
  getCamera2DVisibleBounds(camera, visibleBounds);

  getCamera2DParallaxPoint(camera, 0.1, parallaxOffset);
  starsContainer.x = parallaxOffset.x;
  starsContainer.y = parallaxOffset.y;
  invalidateNodeLocalTransform(starsContainer);

  getCamera2DParallaxPoint(camera, 0.4, parallaxOffset);
  mountainsContainer.x = parallaxOffset.x;
  mountainsContainer.y = parallaxOffset.y;
  invalidateNodeLocalTransform(mountainsContainer);

  getCamera2DParallaxPoint(camera, 0.6, parallaxOffset);
  cloudsContainer.x = parallaxOffset.x;
  cloudsContainer.y = parallaxOffset.y;
  invalidateNodeLocalTransform(cloudsContainer);

  worldContainer.scaleX = viewMatrix.a;
  worldContainer.skewY = viewMatrix.b;
  worldContainer.skewX = viewMatrix.c;
  worldContainer.scaleY = viewMatrix.d;
  worldContainer.x = viewMatrix.tx;
  worldContainer.y = viewMatrix.ty;
  invalidateNodeLocalTransform(worldContainer);

  clearShapeCommands(playerShape);
  appendShapeBeginFill(playerShape, 0xffcc33, 1);
  appendShapePolygon(playerShape, [
    player.x,
    player.y - PLAYER_SIZE,
    player.x + PLAYER_SIZE * 0.8,
    player.y + PLAYER_SIZE * 0.6,
    player.x - PLAYER_SIZE * 0.8,
    player.y + PLAYER_SIZE * 0.6,
  ]);
  appendShapeEndFill(playerShape);
  appendShapeLineStyle(playerShape, 2, 0xcc9900, 1);
  appendShapePolygon(playerShape, [
    player.x,
    player.y - PLAYER_SIZE,
    player.x + PLAYER_SIZE * 0.8,
    player.y + PLAYER_SIZE * 0.6,
    player.x - PLAYER_SIZE * 0.8,
    player.y + PLAYER_SIZE * 0.6,
  ]);
  appendShapeEndFill(playerShape);
  invalidateNodeAppearance(playerShape);

  clearShapeCommands(visibleBoundsShape);
  appendShapeLineStyle(visibleBoundsShape, 2, 0x00c864, 0.6);
  appendShapeRectangle(visibleBoundsShape, visibleBounds.x, visibleBounds.y, visibleBounds.width, visibleBounds.height);
  appendShapeEndFill(visibleBoundsShape);
  invalidateNodeAppearance(visibleBoundsShape);

  cameraLabel.data.text = `Camera3D: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})  Zoom: ${camera.zoom.toFixed(2)}`;
  invalidateNodeAppearance(cameraLabel);
  playerLabel.data.text = `Player: (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`;
  invalidateNodeAppearance(playerLabel);

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
