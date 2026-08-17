// color-adjustment — render-verifies the inline color-adjustment fold on WebGL: a white sprite carrying
// a packed red tint on its base Node runtime slot draws pure red.
//
// setNodeColorAdjustmentsTint authors the complete stack dimension-agnostically, and
// registerGlColorAdjustmentMaterialFeature installs the opt-in material feature that turns the source red.
//
// Cross-backend parity: the fold is a GL/WGPU capability. The Canvas sibling (color-adjustment.canvas.ts)
// has no fold, so it blits an already-red source to render the same red square — every backend draws the
// same bytes, while GL/WGPU genuinely exercise the fold. (Same split as bitmap-color-transform.)
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayObject,
  createImageResource,
  createSprite,
  createTexture,
  createTextureAtlas,
  getTextureAtlasRegionTexture,
  registerGlColorAdjustmentMaterialFeature,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  setNodeColorAdjustmentsTint,
  SpriteKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const REGION = 160;
const SPRITE_X = 320;
const SPRITE_Y = 220;

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black
  kinds: [SpriteKind],
  expectedImageDescription:
    'On an opaque black field (800×600): a single flat red 160×160 square at (320, 220). ' +
    'The red is uniform and fully opaque — pure red channel, zero green, zero blue. No ' +
    'gradient, no tint variation, no other colors. Every other pixel is black.',
});
// Opt into the inline color-adjustment fold on this GL state (the tint would be skipped otherwise).
if (target.kind === 'webgl') registerGlColorAdjustmentMaterialFeature(target.state);
const { render, width } = target;

// Solid WHITE source — the fold tints it red at draw time.
function makeWhiteCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REGION;
  c.height = REGION;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, REGION, REGION);
  return c;
}

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createImageResource(makeWhiteCanvas()) }),
});
addTextureAtlasRegion(atlas, 0, 0, REGION, REGION);

const root = createDisplayObject();

const sprite = createSprite();
sprite.data.texture = getTextureAtlasRegionTexture(atlas, 0);
sprite.x = SPRITE_X;
sprite.y = SPRITE_Y;
// Red tint as a color-adjustment stack on the node runtime slot: keep red, zero green/blue, keep alpha.
setNodeColorAdjustmentsTint(sprite, 0xff0000ff);
addNodeChild(root, sprite);
invalidateNodeLocalTransform(sprite);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const center = at(SPRITE_X + REGION / 2, SPRITE_Y + REGION / 2);
  if (!isRed(center)) {
    throw new Error(`[color-adjustment] tinted sprite center not red — got #${hex(center)}`);
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
