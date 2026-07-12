// color-adjustment — the Canvas sibling of the GL/WGPU color-adjustment fold scenes. The inline
// color-adjustment fold (a node's ColorTransformAdjustment folded into the batch draw) is a GL/WGPU
// capability; the Canvas 2D display renderers do not realize it, so a node-attached color adjustment draws
// untinted here. To stay byte-for-byte in parity with the GL/WGPU siblings (which tint a WHITE source red
// via the fold), this variant blits an already-RED source and attaches no adjustment — the same red square,
// same position. The fold itself is render-verified by the .webgl.ts / .webgpu.ts siblings; this file only
// keeps the cross-backend parity image identical. (Same split as bitmap-color-transform.)
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayContainer,
  createImageResource,
  createSprite,
  createTextureAtlas,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  SpriteKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const REGION = 160;
const SPRITE_X = 320;
const SPRITE_Y = 220;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black
  kinds: [SpriteKind],
});

// Solid RED source — Canvas has no fold, so the parity image is produced by an already-red source.
function makeRedCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REGION;
  c.height = REGION;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.fillRect(0, 0, REGION, REGION);
  return c;
}

const atlas = createTextureAtlas({ image: createImageResource(makeRedCanvas()) });
addTextureAtlasRegion(atlas, 0, 0, REGION, REGION);

const root = createDisplayContainer();

const sprite = createSprite();
sprite.data.atlas = atlas;
sprite.data.id = 0;
sprite.x = SPRITE_X;
sprite.y = SPRITE_Y;
addNodeChild(root, sprite);
invalidateNodeLocalTransform(sprite);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const center = at(SPRITE_X + REGION / 2, SPRITE_Y + REGION / 2);
  if (!isRed(center)) {
    throw new Error(`[color-adjustment] sprite center not red — got #${hex(center)}`);
  }
  const corner = at(20, 20);
  if (!isBackground(corner)) {
    throw new Error(`[color-adjustment] background corner not black — got #${hex(corner)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
