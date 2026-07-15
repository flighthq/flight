import type { Bitmap, DisplayObject, Spritesheet, SpritesheetPlayer } from '@flighthq/sdk';
import {
  addNodeChild,
  createBitmap,
  createDisplayObject,
  createImageResource,
  createRectangle,
  createSpritesheetAnimation,
  createSpritesheetFromGrid,
  createSpritesheetPlayer,
  getSpritesheetPlayerFrame,
  getTextureAtlasRegionById,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  playSpritesheetAnimation,
  updateSpritesheetPlayer,
} from '@flighthq/sdk';

import { render, scale } from './render';

const FRAME_SIZE = 64;
const FRAME_COUNT = 12;
const STRIP_WIDTH = FRAME_SIZE * FRAME_COUNT;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

function createSpriteStrip(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = STRIP_WIDTH;
  c.height = FRAME_SIZE;
  const ctx = c.getContext('2d')!;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const cx = i * FRAME_SIZE + FRAME_SIZE / 2;
    const cy = FRAME_SIZE / 2;
    const phase = (i / FRAME_COUNT) * Math.PI * 2;
    const widthFactor = Math.abs(Math.cos(phase));
    const rx = Math.max(2, 24 * widthFactor);
    const ry = 24;

    const hue = 40 + widthFactor * 10;
    const lightness = 45 + widthFactor * 15;
    const highlightX = cx - rx * 0.3 * Math.sign(Math.cos(phase));

    const grad = ctx.createRadialGradient(highlightX, cy - 4, 2, cx, cy, ry + 2);
    grad.addColorStop(0, `hsl(${hue}, 85%, ${lightness + 20}%)`);
    grad.addColorStop(0.5, `hsl(${hue}, 80%, ${lightness}%)`);
    grad.addColorStop(1, `hsl(${hue - 10}, 70%, ${lightness - 20}%)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    if (widthFactor > 0.15) {
      const edgeX = cx + (Math.cos(phase) > 0 ? -1 : 1) * rx * 0.85;
      ctx.strokeStyle = `hsla(35, 60%, 30%, ${0.4 * widthFactor})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(edgeX, cy, 1.5, ry * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = `hsl(${hue - 10}, 60%, ${lightness - 25}%)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  return c;
}

// Build the spritesheet from the procedural sprite strip.

const stripCanvas = createSpriteStrip();
const imageResource = createImageResource(stripCanvas);

const spritesheet: Spritesheet = createSpritesheetFromGrid({
  columns: FRAME_COUNT,
  imageFile: '',
  imageHeight: FRAME_SIZE,
  imageWidth: STRIP_WIDTH,
  rows: 1,
});

// Attach the image resource to the atlas that createSpritesheetFromGrid built internally.
spritesheet.atlas!.image = imageResource;

// Create two animations over the spritesheet frames.

const allFrameIndices = Array.from({ length: FRAME_COUNT }, (_, i) => i);

const spinAnimation = createSpritesheetAnimation({
  frameDuration: 80,
  frames: allFrameIndices,
  loop: true,
});

const pingpongAnimation = createSpritesheetAnimation({
  direction: 'pingpong',
  frameDuration: 120,
  frames: allFrameIndices,
  loop: true,
});

// Applies the current player frame's atlas region to a Bitmap's sourceRectangle.

function applyFrameToBitmap(player: Readonly<SpritesheetPlayer>, sheet: Readonly<Spritesheet>, bitmap: Bitmap): void {
  const frame = getSpritesheetPlayerFrame(player, sheet);
  if (frame === null || sheet.atlas === null) return;
  const region = getTextureAtlasRegionById(sheet.atlas, frame.id);
  if (region === null) return;
  if (bitmap.data.sourceRectangle === null) {
    bitmap.data.sourceRectangle = createRectangle(region.x, region.y, region.width, region.height);
  } else {
    bitmap.data.sourceRectangle.x = region.x;
    bitmap.data.sourceRectangle.y = region.y;
    bitmap.data.sourceRectangle.width = region.width;
    bitmap.data.sourceRectangle.height = region.height;
  }
  invalidateNodeAppearance(bitmap);
}

// Instance 1: spinning star at normal speed (1x).

const bitmap1 = createBitmap();
bitmap1.data.image = imageResource;
bitmap1.x = 120;
bitmap1.y = 140;
bitmap1.scaleX = 3;
bitmap1.scaleY = 3;
invalidateNodeLocalTransform(bitmap1);
addNodeChild(root, bitmap1);

const player1 = createSpritesheetPlayer();
playSpritesheetAnimation(player1, spinAnimation);

// Instance 2: spinning star at double speed (2x).

const bitmap2 = createBitmap();
bitmap2.data.image = imageResource;
bitmap2.x = 370;
bitmap2.y = 140;
bitmap2.scaleX = 3;
bitmap2.scaleY = 3;
invalidateNodeLocalTransform(bitmap2);
addNodeChild(root, bitmap2);

const player2 = createSpritesheetPlayer();
player2.speed = 2;
playSpritesheetAnimation(player2, spinAnimation);

// Instance 3: pingpong animation.

const bitmap3 = createBitmap();
bitmap3.data.image = imageResource;
bitmap3.x = 620;
bitmap3.y = 140;
bitmap3.scaleX = 3;
bitmap3.scaleY = 3;
invalidateNodeLocalTransform(bitmap3);
addNodeChild(root, bitmap3);

const player3 = createSpritesheetPlayer();
playSpritesheetAnimation(player3, pingpongAnimation);

// Apply initial frames so the bitmaps are visible on the first render.

applyFrameToBitmap(player1, spritesheet, bitmap1);
applyFrameToBitmap(player2, spritesheet, bitmap2);
applyFrameToBitmap(player3, spritesheet, bitmap3);

let lastTime = performance.now();

function enterFrame(now: number): void {
  const deltaTime = now - lastTime;
  lastTime = now;

  updateSpritesheetPlayer(player1, deltaTime);
  updateSpritesheetPlayer(player2, deltaTime);
  updateSpritesheetPlayer(player3, deltaTime);

  applyFrameToBitmap(player1, spritesheet, bitmap1);
  applyFrameToBitmap(player2, spritesheet, bitmap2);
  applyFrameToBitmap(player3, spritesheet, bitmap3);

  render(root as DisplayObject);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
