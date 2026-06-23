// sprite-atlas — validates the Sprite display object drawing a sub-region of a shared texture atlas.
//
// A Sprite carries no pixels of its own: it references a TextureAtlas plus a region id, and the renderer
// blits that region's source rectangle from the atlas image. This is the foundational atlas-batch path and
// the recipe every sprite/tilemap/particle feature builds on. The scene builds ONE atlas image whose left
// half is red (region 0) and right half is green (region 1), then places two Sprites at different screen
// positions — one bound to region 0, one to region 1. The oracle is visual on purpose: it proves the same
// atlas, addressed by two different region ids, produces two differently-colored sprites at two locations,
// and that a Sprite draws its region's footprint and nothing outside it (empty area stays background).
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

// Each atlas region is REGION x REGION pixels. The atlas image is 2*REGION wide (red half | green half).
const REGION = 64;

// Sprite A (red, region 0) top-left, and Sprite B (green, region 1) top-left, in logical space.
const A_X = 180;
const A_Y = 200;
const B_X = 520;
const B_Y = 360;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [SpriteKind],
});

// Build one atlas image: left half solid red, right half solid green.
function makeAtlasCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REGION * 2;
  c.height = REGION;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.fillRect(0, 0, REGION, REGION);
  ctx.fillStyle = 'rgb(0,255,0)';
  ctx.fillRect(REGION, 0, REGION, REGION);
  return c;
}

const atlas = createTextureAtlas({ image: createImageResource(makeAtlasCanvas()) });
addTextureAtlasRegion(atlas, 0, 0, REGION, REGION); // region id 0 — red
addTextureAtlasRegion(atlas, REGION, 0, REGION, REGION); // region id 1 — green

const root = createDisplayContainer();

const spriteA = createSprite();
spriteA.data.atlas = atlas;
spriteA.data.id = 0; // red region
spriteA.x = A_X;
spriteA.y = A_Y;
addNodeChild(root, spriteA);
invalidateNodeLocalTransform(spriteA);

const spriteB = createSprite();
spriteB.data.atlas = atlas;
spriteB.data.id = 1; // green region
spriteB.x = B_X;
spriteB.y = B_Y;
addNodeChild(root, spriteB);
invalidateNodeLocalTransform(spriteB);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Sprite A draws its region with top-left at (A_X, A_Y); sample its center.
  const aMid = at(A_X + REGION / 2, A_Y + REGION / 2);
  if (!isRed(aMid)) {
    throw new Error(`[sprite-atlas] sprite A (region 0) center not red — got #${hex(aMid)}`);
  }

  // Sprite B draws region 1; its center must be green — proving the id selects a different sub-rect.
  const bMid = at(B_X + REGION / 2, B_Y + REGION / 2);
  if (!isGreen(bMid)) {
    throw new Error(`[sprite-atlas] sprite B (region 1) center not green — got #${hex(bMid)}`);
  }

  // Empty space between the two sprites stays background — a Sprite only paints its region footprint.
  const gap = at((A_X + B_X) / 2, (A_Y + B_Y) / 2);
  if (!isBackground(gap)) {
    throw new Error(`[sprite-atlas] gap between sprites not background — got #${hex(gap)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isGreen(rgb: number): boolean {
  return channel(rgb, 8) > 180 && channel(rgb, 16) < 90 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
