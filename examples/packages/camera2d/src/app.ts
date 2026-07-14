import {
  createCamera2D,
  getCamera2DParallaxPoint,
  getCamera2DViewMatrix,
  getCamera2DVisibleBounds,
  updateCamera2DFollow,
  zoomCamera2DAtScreenPoint,
} from '@flighthq/camera2d';
import { createMatrix, createRectangle, createVector2 } from '@flighthq/sdk';
import type { Matrix, Rectangle } from '@flighthq/sdk';

import { canvas, CANVAS_HEIGHT, CANVAS_WIDTH, ctx, scale } from './render';

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

interface Landmark {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  kind: 'rect' | 'circle';
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

const rand = seededRandom(42);

function randomColor(): string {
  const hue = Math.floor(rand() * 360);
  return `hsl(${hue}, 60%, 50%)`;
}

const landmarks: Landmark[] = [];

for (let i = 0; i < 60; i++) {
  const kind = rand() > 0.5 ? 'rect' : 'circle';
  const size = 20 + rand() * 80;
  landmarks.push({
    x: 100 + rand() * (WORLD_WIDTH - 200),
    y: 100 + rand() * (WORLD_HEIGHT - 200),
    width: size,
    height: kind === 'circle' ? size : 20 + rand() * 80,
    color: randomColor(),
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

const viewMatrix = createMatrix();
const visibleBounds = createRectangle();
const parallaxOffset = createVector2();

let lastTime = performance.now();

window.addEventListener('keydown', (e: KeyboardEvent) => {
  keysDown.add(e.key);
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
  keysDown.delete(e.key);
});

canvas.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
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

function drawParallaxLayers(): void {
  // Layer 1: stars (factor 0.1 -- nearly screen-locked, far background)
  getCamera2DParallaxPoint(camera, 0.1, parallaxOffset);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const star of stars) {
    ctx.fillStyle = `rgba(255, 255, 220, ${star.brightness})`;
    ctx.beginPath();
    ctx.arc(star.x + parallaxOffset.x, star.y + parallaxOffset.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Layer 2: mountains (factor 0.4 -- mid background)
  getCamera2DParallaxPoint(camera, 0.4, parallaxOffset);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = 'rgba(60, 80, 100, 0.6)';
  for (const mt of mountains) {
    const bx = mt.x + parallaxOffset.x;
    const by = mt.baseY + parallaxOffset.y;
    ctx.beginPath();
    ctx.moveTo(bx - mt.width * 0.5, by);
    ctx.lineTo(bx, by - mt.peakHeight);
    ctx.lineTo(bx + mt.width * 0.5, by);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Layer 3: clouds (factor 0.6 -- near background)
  getCamera2DParallaxPoint(camera, 0.6, parallaxOffset);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = 'rgba(200, 210, 230, 0.4)';
  for (const cloud of clouds) {
    const cx = cloud.x + parallaxOffset.x;
    const cy = cloud.y + parallaxOffset.y;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cloud.width * 0.5, cloud.height * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWorldGrid(vm: Readonly<Matrix>): void {
  ctx.save();
  ctx.setTransform(vm.a * scale, vm.b * scale, vm.c * scale, vm.d * scale, vm.tx * scale, vm.ty * scale);

  ctx.strokeStyle = 'rgba(100, 120, 140, 0.15)';
  ctx.lineWidth = 1;
  const gridSize = 100;
  for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawWorldBorder(vm: Readonly<Matrix>): void {
  ctx.save();
  ctx.setTransform(vm.a * scale, vm.b * scale, vm.c * scale, vm.d * scale, vm.tx * scale, vm.ty * scale);

  ctx.strokeStyle = 'rgba(200, 80, 80, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.setLineDash([]);

  ctx.restore();
}

function drawLandmarks(vm: Readonly<Matrix>): void {
  ctx.save();
  ctx.setTransform(vm.a * scale, vm.b * scale, vm.c * scale, vm.d * scale, vm.tx * scale, vm.ty * scale);

  for (const lm of landmarks) {
    ctx.fillStyle = lm.color;
    ctx.globalAlpha = 0.7;
    if (lm.kind === 'rect') {
      ctx.fillRect(lm.x - lm.width * 0.5, lm.y - lm.height * 0.5, lm.width, lm.height);
    } else {
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, lm.width * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPlayer(vm: Readonly<Matrix>): void {
  ctx.save();
  ctx.setTransform(vm.a * scale, vm.b * scale, vm.c * scale, vm.d * scale, vm.tx * scale, vm.ty * scale);

  ctx.fillStyle = '#ffcc33';
  ctx.strokeStyle = '#cc9900';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(player.x, player.y - PLAYER_SIZE);
  ctx.lineTo(player.x + PLAYER_SIZE * 0.8, player.y + PLAYER_SIZE * 0.6);
  ctx.lineTo(player.x - PLAYER_SIZE * 0.8, player.y + PLAYER_SIZE * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawVisibleBoundsOverlay(bounds: Readonly<Rectangle>, vm: Readonly<Matrix>): void {
  ctx.save();
  ctx.setTransform(vm.a * scale, vm.b * scale, vm.c * scale, vm.d * scale, vm.tx * scale, vm.ty * scale);

  ctx.strokeStyle = 'rgba(0, 200, 100, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.setLineDash([]);

  ctx.restore();
}

function drawHud(): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(8, 8, 260, 80);

  ctx.fillStyle = '#ffffff';
  ctx.font = '13px monospace';
  ctx.fillText(`Camera: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})  Zoom: ${camera.zoom.toFixed(2)}`, 16, 28);
  ctx.fillText(`Player: (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`, 16, 46);
  ctx.fillText('WASD/Arrows: move  Scroll: zoom', 16, 64);
  ctx.fillText('Green = visible bounds  Red = world border', 16, 80);

  ctx.restore();
}

function enterFrame(): void {
  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updatePlayer(deltaTime);
  updateCamera2DFollow(camera, player.x, player.y, deltaTime, followOptions);
  getCamera2DViewMatrix(camera, viewMatrix);
  getCamera2DVisibleBounds(camera, visibleBounds);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  drawParallaxLayers();
  drawWorldGrid(viewMatrix);
  drawWorldBorder(viewMatrix);
  drawLandmarks(viewMatrix);
  drawPlayer(viewMatrix);
  drawVisibleBoundsOverlay(visibleBounds, viewMatrix);
  drawHud();

  requestAnimationFrame(enterFrame);
}

enterFrame();
