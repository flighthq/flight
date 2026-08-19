// color-adjustment — render-verifies the inline color-adjustment fold on WebGPU, against a reference
// baked into the same picture: a true red rect on the left, drawn red, and a WHITE source on the right
// carrying a red color-adjustment tint. They agree only if the fold ran.
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
  registerWgpuColorAdjustmentMaterialFeature,
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
    'On an opaque black 800x600 field, two flat RED 160x160 squares sit side by side on the same row, tops at ' +
    'y=220: one at x=180 and one at x=460, separated by a 120-pixel black gap. Both are the same uniform ' +
    'fully-opaque red - full red channel, zero green, zero blue - and neither shows a gradient or tint ' +
    'variation. They are produced two different ways on purpose: the left square is drawn red directly and ' +
    'carries no adjustment, while the right one is a WHITE source carrying a red color-adjustment tint on its ' +
    'node runtime slot, folded into the draw. THE PAIR IS THE POINT: the left square is the reference the ' +
    'right one must match, so an adjustment that silently did not run shows up as a white square beside a red ' +
    'one rather than as a picture nobody can judge. Every other pixel is black.',
});
// Opt into the inline color-adjustment fold on this Wgpu state; the tint is skipped otherwise.
if (target.kind === 'webgpu') registerWgpuColorAdjustmentMaterialFeature(target.state);
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

// ★ THE TWO SQUARES ARE COMPARED TO EACH OTHER, not to a constant. A tolerance against a hard-coded red
// would still pass if the fold quietly stopped running and something else in the pipeline happened to
// leave the sprite red; comparing against a rect drawn red by a different route is what makes this a
// second opinion rather than a restatement.
export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  const reference = at(REFERENCE_X + REGION / 2, SQUARE_Y + REGION / 2);
  const adjusted = at(ADJUSTED_X + REGION / 2, SQUARE_Y + REGION / 2);

  if (!isRed(reference)) {
    throw new Error(`[color-adjustment] the baked-in reference square is #${hex(reference)}, not red`);
  }
  for (const shift of [16, 8, 0]) {
    if (Math.abs(channel(adjusted, shift) - channel(reference, shift)) > 8) {
      throw new Error(
        `[color-adjustment] the adjusted square is #${hex(adjusted)} but the reference beside it is ` +
          `#${hex(reference)} — the color-adjustment fold did not produce the reference colour. FIRST ` +
          `CHECK THE ORDER OF THE addSquare CALLS ABOVE: the two squares use different textures and so ` +
          `land in different batches, and only the FIRST BATCH of a frame has its adjustment honoured, ` +
          `so the adjusted square must be added before the reference one`,
      );
    }
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
