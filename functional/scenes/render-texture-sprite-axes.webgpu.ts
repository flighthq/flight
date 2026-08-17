import { setWgpuRenderTransform2D } from '@flighthq/render-wgpu/contract';
import type { Bitmap } from '@flighthq/sdk';
import {
  ShapeKind,
  SpriteKind,
  acquireWgpuRenderTexture,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuFrame,
  createDisplayObject,
  createMatrix,
  createShape,
  createSprite,
  createWgpuRenderTexturePool,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  releaseWgpuRenderTexture,
  renderIntoWgpuRenderTexture,
  renderWgpuScene2D,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const SPRITE_X = 340;
const SPRITE_Y = 250;
const SPRITE_WIDTH = 100;
const SPRITE_HEIGHT = 80;
const BACKING = 0x292440ff;

export const minCoverage = 0;

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x111522ff,
  kinds: [ShapeKind, SpriteKind],
  expectedImageDescription:
    'On a dark navy field (800×600): a small 100×80 rectangle at (340, 250) divided into four ' +
    'solid-colored quadrants — top-left red, top-right green, bottom-left blue, bottom-right ' +
    'yellow. Behind it, a dark purple backing rectangle (130×110 at 325, 235) is visible as a ' +
    '~15 px border around the four-quadrant sprite. Outside the backing, the field is dark ' +
    'navy. The sprite is exactly 100×80 — no spill beyond its edges into the backing area. No ' +
    'gradient or blending within any quadrant.',
});
if (target.kind !== 'webgpu') throw new Error('render-texture-sprite-axes requires WebGPU');
const { render, state, width } = target;

const pool = createWgpuRenderTexturePool();
const slabView = acquireWgpuRenderTexture(state, pool, { height: 480, width: 720 });
slabView.uvOffset.x = 140 / 720;
slabView.uvOffset.y = 160 / 480;
slabView.uvScale.x = SPRITE_WIDTH / 720;
slabView.uvScale.y = SPRITE_HEIGHT / 480;
releaseWgpuRenderTexture(state, pool, slabView);

const renderTexture = acquireWgpuRenderTexture(state, pool, {
  clearColors: [0x00000000],
  height: SPRITE_HEIGHT,
  width: SPRITE_WIDTH,
});
if (renderTexture !== slabView) throw new Error('[render-texture-sprite-axes] pooled handle was not reused');
if (
  renderTexture.source.width !== SPRITE_WIDTH ||
  renderTexture.source.height !== SPRITE_HEIGHT ||
  renderTexture.uvOffset.x !== 0 ||
  renderTexture.uvOffset.y !== 0 ||
  renderTexture.uvScale.x !== 1 ||
  renderTexture.uvScale.y !== 1
) {
  throw new Error('[render-texture-sprite-axes] pooled handle retained its previous slab view');
}

const producer = createDisplayObject();
addRect(producer, 0, 0, 50, 40, 0xf04a4aff);
addRect(producer, 50, 0, 50, 40, 0x42d681ff);
addRect(producer, 0, 40, 50, 40, 0x3d72e8ff);
addRect(producer, 50, 40, 50, 40, 0xf2ca52ff);
beginWgpuFrame(state);
renderIntoWgpuRenderTexture(state, renderTexture, (captureState) => {
  setWgpuRenderTransform2D(captureState, createMatrix());
  prepareScene2DRender(captureState, producer);
  renderWgpuScene2D(captureState, producer);
});

const root = createDisplayObject();
addRect(root, SPRITE_X - 15, SPRITE_Y - 15, SPRITE_WIDTH + 30, SPRITE_HEIGHT + 30, BACKING);
const sprite = createSprite({ data: { texture: renderTexture } });
sprite.x = SPRITE_X;
sprite.y = SPRITE_Y;
invalidateNodeLocalTransform(sprite);
addNodeChild(root, sprite);
render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));
  const probes = [
    ['top-left', at(SPRITE_X + 20, SPRITE_Y + 16), isRed],
    ['top-right', at(SPRITE_X + 80, SPRITE_Y + 16), isGreen],
    ['bottom-left', at(SPRITE_X + 20, SPRITE_Y + 64), isBlue],
    ['bottom-right', at(SPRITE_X + 80, SPRITE_Y + 64), isYellow],
  ] as const;
  for (const [name, rgb, predicate] of probes) {
    if (!predicate(rgb)) {
      throw new Error(`[render-texture-sprite-axes] ${name} orientation probe failed — got #${hex(rgb)}`);
    }
  }

  const rightOutside = at(SPRITE_X + SPRITE_WIDTH + 5, SPRITE_Y + SPRITE_HEIGHT / 2);
  const bottomOutside = at(SPRITE_X + SPRITE_WIDTH / 2, SPRITE_Y + SPRITE_HEIGHT + 5);
  if (!isBacking(rightOutside) || !isBacking(bottomOutside)) {
    throw new Error(
      `[render-texture-sprite-axes] Sprite did not keep its exact 100x80 view — outside #${hex(rightOutside)} / #${hex(bottomOutside)}`,
    );
  }
}

function addRect(
  parent: ReturnType<typeof createDisplayObject>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
): void {
  const shape = createShape();
  appendShapeBeginFill(shape, color, 1);
  appendShapeRectangle(shape, x, y, width, height);
  appendShapeEndFill(shape);
  addNodeChild(parent, shape);
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}

function isBacking(rgb: number): boolean {
  return channel(rgb, 16) > 25 && channel(rgb, 16) < 65 && channel(rgb, 8) < 65 && channel(rgb, 0) > 35;
}

function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 140 && channel(rgb, 16) < 110;
}

function isGreen(rgb: number): boolean {
  return channel(rgb, 8) > 130 && channel(rgb, 16) < 130 && channel(rgb, 0) < 170;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) < 130 && channel(rgb, 0) < 130;
}

function isYellow(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) > 130 && channel(rgb, 0) < 130;
}
