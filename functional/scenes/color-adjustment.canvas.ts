// color-adjustment — a baked-in reference beside the treated rectangle, per the user's own shape: a
// true red rect next to an adjusted rectangle. Nothing in this file blits an already-red source to
// manufacture agreement; the LEFT rect is red because it is drawn red, and the RIGHT rect is red only
// if the color-adjustment stack actually ran.
//
// The inline color-adjustment fold is a Gl/Wgpu material feature. The Canvas 2D display renderers do
// not implement it, so the right rect draws WHITE here, and the reference beside it is what makes that
// legible without a second cell to compare against.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayObject,
  createImageResource,
  createSprite,
  createTexture,
  createTextureAtlas,
  getBitmapPixelRgb,
  getTextureAtlasRegionTexture,
  invalidateNodeLocalTransform,
  setNodeColorAdjustmentsTint,
  SpriteKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const REGION = 160;
const REFERENCE_X = 180;
const ADJUSTED_X = 460;
const SQUARE_Y = 220;
const TINT = 0xff0000ff;

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [SpriteKind],
  expectedImageDescription:
    'On an opaque black 800x600 field, two flat 160x160 squares sit side by side on the same row, tops at ' +
    'y=220: a RED one at x=180 and a WHITE one at x=460, separated by a 120-pixel black gap. The left square ' +
    'is the baked-in reference - it is drawn red, with no adjustment attached, so it is red on every backend. ' +
    'The right square carries a red color-adjustment tint on its node runtime slot; the Canvas 2D display ' +
    'renderers do not implement the inline color-adjustment fold, so the tint does not apply and the square ' +
    'draws white. THE PAIR IS THE POINT: on a backend that folds the adjustment the two squares are the same ' +
    'red, and the difference visible here is the missing fold, measured against a reference that is in the ' +
    'picture rather than in another cell. Every other pixel is black.',
});
const { render, width } = target;

function makeReferenceCanvas(): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = REGION;
  element.height = REGION;
  const context = element.getContext('2d')!;
  context.fillStyle = 'rgb(255,0,0)';
  context.fillRect(0, 0, REGION, REGION);
  return element;
}

function makeAdjustedCanvas(): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = REGION;
  element.height = REGION;
  const context = element.getContext('2d')!;
  context.fillStyle = 'rgb(255,255,255)';
  context.fillRect(0, 0, REGION, REGION);
  return element;
}

function addSquare(root: ReturnType<typeof createDisplayObject>, source: HTMLCanvasElement, x: number): void {
  const atlas = createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResource(source) }),
  });
  addTextureAtlasRegion(atlas, 0, 0, REGION, REGION);
  const sprite = createSprite();
  sprite.data.texture = getTextureAtlasRegionTexture(atlas, 0);
  sprite.x = x;
  sprite.y = SQUARE_Y;
  // The tint is authored BEFORE the node joins the graph, matching the order the fold's own scenes use.
  if (x === ADJUSTED_X) setNodeColorAdjustmentsTint(sprite, TINT);
  addNodeChild(root, sprite);
  invalidateNodeLocalTransform(sprite);
}

const root = createDisplayObject();
// ★ THE ADJUSTED SQUARE IS ADDED FIRST, AND THAT IS LOAD-BEARING. Only the FIRST BATCH of a frame has
// its colour adjustment honoured; a batch after it draws with no fold at all. These two squares carry
// different textures, so they are two batches, and with the reference added first the adjusted square
// renders WHITE on both Gl and Wgpu. Nothing about the PICTURE depends on the order — the squares are
// opaque and do not overlap — so a later reader tidying these two lines into left-to-right order would
// silently turn the fold off. The assertion below is what catches that; this comment only says why.
addSquare(root, makeAdjustedCanvas(), ADJUSTED_X);
addSquare(root, makeReferenceCanvas(), REFERENCE_X);

render(root);

// ★ THIS CELL ASSERTS THE GAP IT ACTUALLY RENDERS, not the picture the Gl siblings draw. The reference
// square must be red because it is drawn red; the adjusted square must be WHITE because the Canvas 2D
// display renderers do not fold a node color adjustment. If the fold ever lands here, this assertion
// fails loudly and points at the file to update — which is the behaviour a stale expectation should
// have, rather than passing quietly on a picture that changed.
export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  const reference = at(REFERENCE_X + REGION / 2, SQUARE_Y + REGION / 2);
  const adjusted = at(ADJUSTED_X + REGION / 2, SQUARE_Y + REGION / 2);

  if (!isRed(reference)) {
    throw new Error(`[color-adjustment] the baked-in reference square is #${hex(reference)}, not red`);
  }
  if (!isWhite(adjusted)) {
    throw new Error(
      `[color-adjustment] the adjusted square is #${hex(adjusted)}, expected white — Canvas 2D does not ` +
        `fold a node color adjustment, so a red square here means the capability landed and this cell ` +
        `and its description need updating`,
    );
  }
  const corner = at(20, 20);
  if (!isBackground(corner)) {
    throw new Error(`[color-adjustment] background corner not black — got #${hex(corner)}`);
  }
}

function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
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
