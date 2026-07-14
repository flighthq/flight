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

// Procedurally generate a sprite strip: 12 frames of a spinning six-pointed star.
// Each frame rotates the star by 30 degrees, completing a full revolution over all frames.

function createSpriteStrip(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = STRIP_WIDTH;
  c.height = FRAME_SIZE;
  const ctx = c.getContext('2d')!;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const cx = i * FRAME_SIZE + FRAME_SIZE / 2;
    const cy = FRAME_SIZE / 2;
    const angle = (i / FRAME_COUNT) * Math.PI * 2;

    // Outer ring glow.
    const gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, 28);
    gradient.addColorStop(0, `hsla(${(i * 30) % 360}, 80%, 60%, 0.9)`);
    gradient.addColorStop(1, `hsla(${(i * 30 + 60) % 360}, 70%, 40%, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(i * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE);

    // Six-pointed star drawn as two overlapping triangles.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    drawStar(ctx, 0, 0, 6, 24, 12);
    ctx.restore();
  }

  return c;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  points: number,
  outerRadius: number,
  innerRadius: number,
): void {
  const step = Math.PI / points;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const a = -Math.PI / 2 + i * step;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd700';
  ctx.fill();
  ctx.strokeStyle = '#cc8800';
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
