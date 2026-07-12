// color-adjustment — render-verifies the inline color-adjustment FOLD on WebGL: a white sprite carrying a
// ColorTransformAdjustment (red multiplier 1, green/blue 0) on its node runtime slot draws pure red, proving
// the fold reads the resolved stack and applies it in the batch draw.
//
// This is the generic off-entity replacement for the old HasColorTransform trait: the adjustment lives on
// the node's runtime slot (setDisplayObjectColorAdjustments), the set-accessor fuses it once into the affine
// ColorTransform the fold consumes, and enableGlColorAdjustment installs the opt-in inline fold that turns
// the white source red. Without enableGlColorAdjustment the tint would be skipped (drawn white).
//
// Cross-backend parity: the fold is a GL/WGPU capability. The Canvas sibling (color-adjustment.canvas.ts)
// has no fold, so it blits an already-red source to render the same red square — every backend draws the
// same bytes, while GL/WGPU genuinely exercise the fold. (Same split as bitmap-color-transform.)
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createColorTransform,
  createColorTransformAdjustment,
  createDisplayContainer,
  createImageResource,
  createSprite,
  createTextureAtlas,
  enableGlColorAdjustment,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  setDisplayObjectColorAdjustments,
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
});
// Opt into the inline color-adjustment fold on this GL state (the tint would be skipped otherwise).
if (target.kind === 'webgl') enableGlColorAdjustment(target.state);
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

const atlas = createTextureAtlas({ image: createImageResource(makeWhiteCanvas()) });
addTextureAtlasRegion(atlas, 0, 0, REGION, REGION);

const root = createDisplayContainer();

const sprite = createSprite();
sprite.data.atlas = atlas;
sprite.data.id = 0;
sprite.x = SPRITE_X;
sprite.y = SPRITE_Y;
// Red tint as a color-adjustment stack on the node runtime slot: keep red, zero green/blue, keep alpha.
setDisplayObjectColorAdjustments(sprite, [
  createColorTransformAdjustment(
    createColorTransform({ redMultiplier: 1, greenMultiplier: 0, blueMultiplier: 0, alphaMultiplier: 1 }),
  ),
]);
addNodeChild(root, sprite);
invalidateNodeLocalTransform(sprite);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

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
