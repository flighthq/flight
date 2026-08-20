// spritesheet-frame — validates that spritesheet grid slicing produces correct source rectangles
// when each frame's atlas region is applied to a Bitmap's sourceRectangle.
//
// Builds a 4-frame horizontal strip (red, green, blue, yellow, each 64x64) in a canvas, slices it
// via createSpritesheetFromGrid, then renders each frame as a separate Bitmap positioned side by
// side. The scene assertion samples the center of each bitmap and verifies the expected solid color. This is
// inherently visual — it exercises per-frame atlas region selection and bitmap source-rect rendering
// that jsdom cannot confirm.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  SpriteKind,
  cloneTexture,
  createSprite,
  createDisplayObject,
  createImageResource,
  createTexture,
  createSpritesheetFromGrid,
  getBitmapPixelRgb,
  getTextureAtlasRegionById,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  setTextureUvFromPixelRect,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 400;
const HEIGHT = 200;
const FRAME_SIZE = 64;
const FRAME_COUNT = 4;

const FRAME_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [SpriteKind],
  expectedImageDescription:
    'A 400x200 opaque black field with four flat 64x64 squares in one row at y 60-124, evenly spaced with ' +
    '20 px gaps: red at x 20-84, green at x 104-168, blue at x 188-252, yellow at x 272-336. The order is ' +
    'part of the claim — each square shows a different quarter of one four-frame strip, so a picture where ' +
    'two squares share a colour, or where the colours run in a different left-to-right order, is wrong. ' +
    'Every square is one flat tone with no gradient and no blending, and the gaps and margins are pure ' +
    'black.',
});

const stripCanvas = document.createElement('canvas');
stripCanvas.width = FRAME_SIZE * FRAME_COUNT;
stripCanvas.height = FRAME_SIZE;
const ctx = stripCanvas.getContext('2d')!;
for (let i = 0; i < FRAME_COUNT; i++) {
  ctx.fillStyle = FRAME_COLORS[i];
  ctx.fillRect(i * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE);
}

const imageResource = createImageResource(stripCanvas);
const atlasTexture = createTexture({ dimension: '2d', source: imageResource });
const spritesheet = createSpritesheetFromGrid({
  columns: FRAME_COUNT,
  imageFile: '',
  imageHeight: FRAME_SIZE,
  imageWidth: FRAME_SIZE * FRAME_COUNT,
  rows: 1,
});
spritesheet.atlas!.texture = atlasTexture;

const root = createDisplayObject();

for (let i = 0; i < FRAME_COUNT; i++) {
  const bitmap = createSprite();
  bitmap.data.texture = cloneTexture(atlasTexture);
  bitmap.x = 20 + i * (FRAME_SIZE + 20);
  bitmap.y = 60;
  invalidateNodeLocalTransform(bitmap);

  const frame = spritesheet.frames[i];
  if (frame !== undefined && spritesheet.atlas !== null) {
    const region = getTextureAtlasRegionById(spritesheet.atlas, frame.id);
    if (region !== null) {
      setTextureUvFromPixelRect(bitmap.data.texture, region.x, region.y, region.width, region.height);
    }
  }
  invalidateNodeAppearance(bitmap);
  addNodeChild(root, bitmap);
}

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const centerY = 60 + FRAME_SIZE / 2;
  for (let i = 0; i < FRAME_COUNT; i++) {
    const centerX = 20 + i * (FRAME_SIZE + 20) + FRAME_SIZE / 2;
    const rgb = at(centerX, centerY);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;

    if (i === 0 && (r < 180 || g > 90 || b > 90)) {
      throw new Error(`[spritesheet-frame] frame 0 expected red, got #${hex(rgb)}`);
    }
    if (i === 1 && (r > 90 || g < 180 || b > 90)) {
      throw new Error(`[spritesheet-frame] frame 1 expected green, got #${hex(rgb)}`);
    }
    if (i === 2 && (r > 90 || g > 90 || b < 180)) {
      throw new Error(`[spritesheet-frame] frame 2 expected blue, got #${hex(rgb)}`);
    }
    if (i === 3 && (r < 180 || g < 180 || b > 90)) {
      throw new Error(`[spritesheet-frame] frame 3 expected yellow, got #${hex(rgb)}`);
    }
  }
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
