// DOM variant of text-strikethrough. The scene is intentionally identical to the shared
// Canvas/WebGL/WebGPU target; only its oracle differs. Native CSS font metrics put DOM's line-through below
// the tighter raster-backend band, so DOM keeps the wider band that its captured render has demonstrated it
// needs.
//
// This looseness is deliberate and isolated. The bottom edge reaches the estimated baseline, so a decoration
// incorrectly drawn at the baseline could satisfy the continuity check. That risk belongs only to DOM's
// native-metrics oracle; it is not a reason to weaken the three raster backends whose strike stays well clear
// of the baseline.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createRichText,
  getBitmapPixelRgb,
  RichTextKind,
  setRichTextFormatRange,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const INK = 0x44ffeeff; // bright cyan text + strike, far from the black background
const FIELD_X = 120;
const FIELD_Y = 240;
const FIELD_W = 560;
const FIELD_H = 120;
const FONT_SIZE = 72;

const TEXT = 'Flight';

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [RichTextKind],
});

const root = createDisplayObject();

const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true };
field.data.multiline = false;
field.data.wordWrap = false;
field.x = FIELD_X;
field.y = FIELD_Y;
field.data.width = FIELD_W;
field.data.height = FIELD_H;
field.data.text = TEXT;

setRichTextFormatRange(field, { color: INK, strikethrough: true }, 0, TEXT.length);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // DOM's native line-through sits outside the shared 0.40..0.65 raster band. Search the measured native
  // range instead, retaining the same continuous-run requirement that distinguishes a decoration from the
  // separated glyph bodies.
  const bandTop = FIELD_Y + Math.round(FONT_SIZE * 0.35);
  const bandBottom = FIELD_Y + Math.round(FONT_SIZE * 0.8);

  const widestRun = findWidestInkRunInBand(at, FIELD_X, FIELD_X + FIELD_W, bandTop, bandBottom);
  if (widestRun < 120) {
    throw new Error(
      `[text-strikethrough/dom] no wide continuous ink run found in the native CSS line-through band ` +
        `(widest run ${widestRun}px, expected >= 120px) — the strikethrough stroke does not appear to be drawn`,
    );
  }
}

function findWidestInkRunInBand(
  at: (x: number, y: number) => number,
  x0: number,
  x1: number,
  yTop: number,
  yBottom: number,
): number {
  let widest = 0;
  for (let y = yTop; y <= yBottom; y += 2) {
    let run = 0;
    for (let x = x0; x < x1; x += 1) {
      if (isInk(at(x, y))) {
        run += 1;
        if (run > widest) widest = run;
      } else {
        run = 0;
      }
    }
  }
  return widest;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function isInk(rgb: number): boolean {
  return channel(rgb, 16) < 150 && channel(rgb, 8) > 120 && channel(rgb, 0) > 120;
}
