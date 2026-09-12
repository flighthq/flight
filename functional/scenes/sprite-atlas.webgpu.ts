// sprite-atlas — validates the Sprite display object drawing a sub-region of a shared texture atlas.
//
// A Sprite carries no pixels of its own: it references a TextureAtlas plus a region id, and the renderer
// blits that region's source rectangle from the atlas image. This is the foundational atlas-batch path and
// the recipe every sprite/tilemap/particle feature builds on. The scene includes ordinary red/green
// regions and a non-square, clockwise-packed region whose upright image is blue over yellow. The latter
// catches ignored UV rotation, swapped dimensions, wrong atlas denominators, and wrong turn direction.
import { createWebImageResourceFromCanvas } from '@flighthq/host-web';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayObject,
  createSprite,
  createTexture,
  createTextureAtlas,
  createTextureAtlasRegion,
  getBitmapPixelRgb,
  getTextureAtlasRegionTexture,
  invalidateNodeLocalTransform,
  SpriteKind,
  TextureAtlasRotation,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Each atlas region is REGION x REGION pixels. The atlas image is 2*REGION wide (red half | green half).
const REGION = 64;
const ROTATED_WIDTH = 48;
const ROTATED_HEIGHT = 80;
const ROTATED_X = REGION * 2;
const ROTATED_Y = 16;

// Sprite A (red, region 0) top-left, and Sprite B (green, region 1) top-left, in logical space.
const A_X = 180;
const A_Y = 200;
const B_X = 520;
const B_Y = 360;
const C_X = 340;
const C_Y = 380;

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [SpriteKind],
  expectedImageDescription:
    'An 800x600 opaque black field with two flat 64x64 squares and one upright 48x80 rectangle: a red square spanning x 180-244, ' +
    'y 200-264, and a green one spanning x 488-552, y 328-392. The two are placed by different ' +
    'anchors — the red square is positioned by its top-left corner at (180,200), while the green one ' +
    'is positioned by its CENTRE at (520,360), so it sits half a square up and to the left of that ' +
    'point. Both are cut from a single shared image ' +
    'whose left half is red and right half is green, and each square shows only its own half — the red ' +
    'square contains no green and the green square no red, with no sliver or seam of the other colour ' +
    'along any edge. Neither square is graded or blended, and everything outside those two footprints, ' +
    'including the whole span between them, is pure black. The third rectangle spans x 340-388 and y 380-460; ' +
    'its top 30 pixels are blue and its lower 50 pixels are yellow even though those texels are stored clockwise ' +
    'in a packed 80x48 atlas rectangle.',
});

// Build one non-square atlas page. The third logical image is drawn through a clockwise quarter-turn,
// exactly as TexturePacker stores a rotated frame.
function makeAtlasCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ROTATED_X + ROTATED_HEIGHT;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.fillRect(0, 0, REGION, REGION);
  ctx.fillStyle = 'rgb(0,255,0)';
  ctx.fillRect(REGION, 0, REGION, REGION);
  ctx.save();
  ctx.translate(ROTATED_X + ROTATED_HEIGHT, ROTATED_Y);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = 'rgb(0,96,255)';
  ctx.fillRect(0, 0, ROTATED_WIDTH, 30);
  ctx.fillStyle = 'rgb(255,224,0)';
  ctx.fillRect(0, 30, ROTATED_WIDTH, ROTATED_HEIGHT - 30);
  ctx.restore();
  return c;
}

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createWebImageResourceFromCanvas(makeAtlasCanvas()) }),
});
addTextureAtlasRegion(atlas, 0, 0, REGION, REGION); // region id 0 — red
addTextureAtlasRegion(atlas, REGION, 0, REGION, REGION, REGION / 2, REGION / 2); // region id 1 — green, center pivot
atlas.regions.push(
  createTextureAtlasRegion({
    height: ROTATED_WIDTH,
    id: 2,
    rotation: TextureAtlasRotation.Clockwise90,
    width: ROTATED_HEIGHT,
    x: ROTATED_X,
    y: ROTATED_Y,
  }),
);

const root = createDisplayObject();

const spriteA = createSprite();
spriteA.data.texture = getTextureAtlasRegionTexture(atlas, 0); // red region
spriteA.x = A_X;
spriteA.y = A_Y;
addNodeChild(root, spriteA);
invalidateNodeLocalTransform(spriteA);

const spriteB = createSprite();
spriteB.data.texture = getTextureAtlasRegionTexture(atlas, 1); // green region
spriteB.pivotX = REGION / 2;
spriteB.pivotY = REGION / 2;
spriteB.x = B_X;
spriteB.y = B_Y;
addNodeChild(root, spriteB);
invalidateNodeLocalTransform(spriteB);

const spriteC = createSprite();
spriteC.data.texture = getTextureAtlasRegionTexture(atlas, 2);
spriteC.x = C_X;
spriteC.y = C_Y;
addNodeChild(root, spriteC);
invalidateNodeLocalTransform(spriteC);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Sprite A draws its region with top-left at (A_X, A_Y); sample its center.
  const aMid = at(A_X + REGION / 2, A_Y + REGION / 2);
  if (!isRed(aMid)) {
    throw new Error(`[sprite-atlas] sprite A (region 0) center not red — got #${hex(aMid)}`);
  }

  // Sprite B's region has a center pivot, so the sprite position itself is the green quad's center.
  const bMid = at(B_X, B_Y);
  if (!isGreen(bMid)) {
    throw new Error(`[sprite-atlas] sprite B (region 1) center not green — got #${hex(bMid)}`);
  }
  const bUnpivotedCorner = at(B_X + REGION - 4, B_Y + REGION - 4);
  if (!isBackground(bUnpivotedCorner)) {
    throw new Error(`[sprite-atlas] sprite B ignored its region pivot — got #${hex(bUnpivotedCorner)}`);
  }

  // Empty space between the two sprites stays background — a Sprite only paints its region footprint.
  const gap = at((A_X + B_X) / 2, (A_Y + B_Y) / 2);
  if (!isBackground(gap)) {
    throw new Error(`[sprite-atlas] gap between sprites not background — got #${hex(gap)}`);
  }

  const cTop = at(C_X + ROTATED_WIDTH / 2, C_Y + 10);
  if (!isBlue(cTop)) {
    throw new Error(`[sprite-atlas] rotated region top not blue — got #${hex(cTop)}`);
  }
  const cBottom = at(C_X + ROTATED_WIDTH / 2, C_Y + ROTATED_HEIGHT - 10);
  if (!isYellow(cBottom)) {
    throw new Error(`[sprite-atlas] rotated region bottom not yellow — got #${hex(cBottom)}`);
  }
  const cPackedWidthLeak = at(C_X + ROTATED_HEIGHT - 4, C_Y + 10);
  if (!isBackground(cPackedWidthLeak)) {
    throw new Error(`[sprite-atlas] rotated region kept its packed width — got #${hex(cPackedWidthLeak)}`);
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
function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 180 && channel(rgb, 16) < 90 && channel(rgb, 8) < 150;
}
function isYellow(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) > 160 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
