import type { Sprite, Node2D, Spritesheet, SpritesheetPlayer } from '@flighthq/sdk';
import {
  addNodeChild,
  createSprite,
  createDisplayObject,
  createImageResource,
  createSpritesheetAnimation,
  createSpritesheetFromGrid,
  createSpritesheetPlayer,
  createTexture,
  getSpritesheetPlayerFrame,
  getTextureAtlasRegionTexture,
  invalidateNodeLocalTransform,
  playSpritesheetAnimation,
  seekSpritesheetPlayerToFrame,
  updateSpritesheetPlayer,
} from '@flighthq/sdk';

import { render, scale } from './render';

// Frames are authored at a higher resolution than they are shown. Downsampling the procedural
// source keeps the wing curves and small face details crisp on every renderer.
const FRAME_SIZE = 256;
const FRAME_COUNT = 12;
const STRIP_WIDTH = FRAME_SIZE * FRAME_COUNT;
const DISPLAY_SCALE = 0.66;
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

function createPresentationCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;

  const field = ctx.createLinearGradient(0, 0, 800, 600);
  field.addColorStop(0, '#101528');
  field.addColorStop(0.55, '#171a35');
  field.addColorStop(1, '#25183a');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, 800, 600);

  const halo = ctx.createRadialGradient(400, 250, 10, 400, 250, 420);
  halo.addColorStop(0, 'rgba(93, 229, 255, 0.12)');
  halo.addColorStop(0.55, 'rgba(119, 91, 255, 0.05)');
  halo.addColorStop(1, 'rgba(20, 14, 40, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 800, 600);

  ctx.fillStyle = '#edf7ffff';
  ctx.font = '700 34px sans-serif';
  ctx.fillText('SPRITESHEET MOTION LAB', 48, 59);
  ctx.fillStyle = '#9aa9c9ff';
  ctx.font = '15px sans-serif';
  ctx.fillText('One atlas · three independent playback modes', 50, 88);

  const cardXs = [48, 285, 522];
  const titles = ['LOOP', 'FAST LOOP', 'PING-PONG'];
  const descriptions = ['1.0× playback', '1.65× playback', '0.85× playback'];
  const accents = ['#4de0ffff', '#9877ffff', '#ff78c8ff'];

  for (let i = 0; i < cardXs.length; i++) {
    const x = cardXs[i];
    ctx.fillStyle = 'rgba(7, 11, 29, 0.62)';
    ctx.strokeStyle = 'rgba(174, 202, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, 126, 230, 394, 18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accents[i];
    ctx.fillRect(x + 22, 154, 30, 3);
    ctx.font = '700 14px sans-serif';
    ctx.fillText(titles[i], x + 22, 184);
    ctx.fillStyle = '#9aa9c9ff';
    ctx.font = '13px sans-serif';
    ctx.fillText(descriptions[i], x + 22, 207);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.beginPath();
    ctx.roundRect(x + 19, 226, 192, 210, 14);
    ctx.fill();

    for (let dot = 0; dot < 8; dot++) {
      ctx.globalAlpha = dot === i * 3 || (i === 2 && dot === 7) ? 1 : 0.24;
      ctx.fillStyle = accents[i];
      ctx.beginPath();
      ctx.arc(x + 35 + dot * 22, 473, dot === i * 3 || (i === 2 && dot === 7) ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#7181a4ff';
  ctx.font = '12px sans-serif';
  ctx.fillText('12 hand-drawn procedural frames · no external image asset', 49, 562);
  return canvas;
}

function createSpriteStrip(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = STRIP_WIDTH;
  c.height = FRAME_SIZE;
  const ctx = c.getContext('2d')!;

  for (let i = 0; i < FRAME_COUNT; i++) {
    ctx.save();
    ctx.translate(i * FRAME_SIZE, 0);

    const cx = FRAME_SIZE / 2;
    const cy = FRAME_SIZE / 2 + Math.sin((i / FRAME_COUNT) * Math.PI * 2) * 7;
    const phase = (i / FRAME_COUNT) * Math.PI * 2;
    const flap = 0.32 + Math.abs(Math.sin(phase)) * 0.68;
    const wingReach = 48 + 42 * flap;
    const wingLift = 30 + 28 * flap;

    const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 105);
    glow.addColorStop(0, 'rgba(92, 233, 255, 0.28)');
    glow.addColorStop(0.45, 'rgba(121, 100, 255, 0.12)');
    glow.addColorStop(1, 'rgba(121, 100, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(15, 15, FRAME_SIZE - 30, FRAME_SIZE - 30);

    ctx.fillStyle = 'rgba(3, 7, 20, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 72, 62 - flap * 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const side of [-1, 1]) {
      const wing = ctx.createLinearGradient(cx, cy, cx + side * wingReach, cy - wingLift);
      wing.addColorStop(0, 'rgba(112, 248, 255, 0.92)');
      wing.addColorStop(0.55, side < 0 ? 'rgba(103, 143, 255, 0.82)' : 'rgba(182, 105, 255, 0.82)');
      wing.addColorStop(1, 'rgba(255, 132, 224, 0.34)');
      ctx.fillStyle = wing;
      ctx.strokeStyle = 'rgba(215, 247, 255, 0.62)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + side * 12, cy - 12);
      ctx.bezierCurveTo(
        cx + side * (34 + 20 * flap),
        cy - wingLift - 28,
        cx + side * wingReach,
        cy - wingLift,
        cx + side * (70 + 18 * flap),
        cy + 12,
      );
      ctx.bezierCurveTo(cx + side * 55, cy + 38, cx + side * 24, cy + 30, cx + side * 10, cy + 13);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(235, 252, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + side * 16, cy - 5);
      ctx.quadraticCurveTo(cx + side * 48, cy - wingLift, cx + side * (76 + 12 * flap), cy - 14);
      ctx.stroke();
    }

    const body = ctx.createLinearGradient(cx - 22, cy - 50, cx + 25, cy + 58);
    body.addColorStop(0, '#edf9ffff');
    body.addColorStop(0.3, '#75e5ffff');
    body.addColorStop(0.68, '#6657d9ff');
    body.addColorStop(1, '#29235eff');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 31, 57, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(220, 249, 255, 0.72)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#172044ff';
    ctx.beginPath();
    ctx.ellipse(cx - 11, cy - 7, 5.5, 8, -0.1, 0, Math.PI * 2);
    ctx.ellipse(cx + 11, cy - 7, 5.5, 8, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eaffffff';
    ctx.beginPath();
    ctx.arc(cx - 9.5, cy - 9, 1.8, 0, Math.PI * 2);
    ctx.arc(cx + 12.5, cy - 9, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#bff8ffff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 47);
    ctx.quadraticCurveTo(cx - 24, cy - 76, cx - 42, cy - 78 - 5 * Math.sin(phase));
    ctx.moveTo(cx + 10, cy - 47);
    ctx.quadraticCurveTo(cx + 24, cy - 76, cx + 42, cy - 78 + 5 * Math.sin(phase));
    ctx.stroke();

    ctx.fillStyle = '#ff8bd8ff';
    ctx.beginPath();
    ctx.arc(cx - 42, cy - 78 - 5 * Math.sin(phase), 4, 0, Math.PI * 2);
    ctx.arc(cx + 42, cy - 78 + 5 * Math.sin(phase), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return c;
}

// Build the spritesheet from the procedural sprite strip.

const stripCanvas = createSpriteStrip();
const imageResource = createImageResource(stripCanvas);

const presentationCanvas = createPresentationCanvas();
const presentationResource = createImageResource(presentationCanvas);
const presentation = createSprite();
presentation.data.texture = createTexture({ dimension: '2d', source: presentationResource });
addNodeChild(root, presentation);

const spritesheet: Spritesheet = createSpritesheetFromGrid({
  columns: FRAME_COUNT,
  imageFile: '',
  imageHeight: FRAME_SIZE,
  imageWidth: STRIP_WIDTH,
  rows: 1,
});

// Attach the image resource to the atlas that createSpritesheetFromGrid built internally.
spritesheet.atlas!.texture = createTexture({ dimension: '2d', source: imageResource });

// Create two animations over the spritesheet frames.

const allFrameIndices = Array.from({ length: FRAME_COUNT }, (_, i) => i);

const spinAnimation = createSpritesheetAnimation({
  frameDuration: 80,
  frames: allFrameIndices,
  repeatCount: -1,
});

const pingpongAnimation = createSpritesheetAnimation({
  direction: 'pingpong',
  frameDuration: 120,
  frames: allFrameIndices,
  repeatCount: -1,
});

// Applies the current player frame's atlas region to a Sprite's sourceRectangle.

function applyFrameToBitmap(player: Readonly<SpritesheetPlayer>, sheet: Readonly<Spritesheet>, bitmap: Sprite): void {
  const frame = getSpritesheetPlayerFrame(player, sheet);
  if (frame === null || sheet.atlas === null) return;
  bitmap.data.texture = getTextureAtlasRegionTexture(sheet.atlas, frame.id);
}

// Instance 1: forward loop at normal speed.

const bitmap1 = createSprite();
bitmap1.x = 79;
bitmap1.y = 246;
bitmap1.scaleX = DISPLAY_SCALE;
bitmap1.scaleY = DISPLAY_SCALE;
invalidateNodeLocalTransform(bitmap1);
addNodeChild(root, bitmap1);

const player1 = createSpritesheetPlayer();
playSpritesheetAnimation(player1, spinAnimation);
seekSpritesheetPlayerToFrame(player1, 0);

// Instance 2: the same loop at a faster rate and a staggered starting frame.

const bitmap2 = createSprite();
bitmap2.x = 316;
bitmap2.y = 246;
bitmap2.scaleX = DISPLAY_SCALE;
bitmap2.scaleY = DISPLAY_SCALE;
invalidateNodeLocalTransform(bitmap2);
addNodeChild(root, bitmap2);

const player2 = createSpritesheetPlayer();
player2.speed = 1.65;
playSpritesheetAnimation(player2, spinAnimation);
seekSpritesheetPlayerToFrame(player2, 3);

// Instance 3: pingpong animation.

const bitmap3 = createSprite();
bitmap3.x = 553;
bitmap3.y = 246;
bitmap3.scaleX = DISPLAY_SCALE;
bitmap3.scaleY = DISPLAY_SCALE;
invalidateNodeLocalTransform(bitmap3);
addNodeChild(root, bitmap3);

const player3 = createSpritesheetPlayer();
player3.speed = 0.85;
playSpritesheetAnimation(player3, pingpongAnimation);
seekSpritesheetPlayerToFrame(player3, 7);

// Apply initial frames so the bitmaps are visible on the first render.

applyFrameToBitmap(player1, spritesheet, bitmap1);
applyFrameToBitmap(player2, spritesheet, bitmap2);
applyFrameToBitmap(player3, spritesheet, bitmap3);

let lastTime = performance.now();

function enterFrame(now: number): void {
  const deltaTime = captureMode ? 1000 / 60 : now - lastTime;
  lastTime = now;

  updateSpritesheetPlayer(player1, deltaTime);
  updateSpritesheetPlayer(player2, deltaTime);
  updateSpritesheetPlayer(player3, deltaTime);

  applyFrameToBitmap(player1, spritesheet, bitmap1);
  applyFrameToBitmap(player2, spritesheet, bitmap2);
  applyFrameToBitmap(player3, spritesheet, bitmap3);

  render(root as Node2D);
  if (!captureMode) requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
