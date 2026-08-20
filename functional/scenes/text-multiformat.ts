// text-multiformat — validates markup-produced per-range text formatting: a single RichText parsed from
// two `<font color>` runs renders each range in its own color. This proves the markup producer widens its
// RGB-only syntax to visible packed RGBA and the layout/raster path honors the resulting ranges.
//
// Multi-format runs are the core of rich text and are purely visual — only a real render shows the two
// colors side by side. The scene assertion is FUZZY about glyph positions: the red half is the LEFT portion of the
// string and the blue half the RIGHT portion, so it scans the field's LEFT third for red pixels and its
// RIGHT third for blue pixels, leaving the middle as an unscanned buffer (the exact split pixel depends
// on glyph metrics). Both colors appearing in their expected halves proves the ranges took effect.
//
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createRichText,
  getBitmapPixelRgb,
  parseTextMarkup,
  RichTextKind,
  setRichTextContent,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const FIELD_X = 80;
const FIELD_Y = 220;
const FIELD_W = 640;
const FIELD_H = 120;
const FONT_SIZE = 56;

// The string splits cleanly into two equal-length halves at the space; the first half renders red, the
// second blue. With equal glyph counts per half, the color boundary lands near the field's horizontal
// midpoint, so the left third is reliably red and the right third reliably blue.
declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [RichTextKind],
  expectedImageDescription:
    'An 800x600 opaque black field with one line of text at about 56 px inside a 640-wide box at x 80-720, ' +
    'y 220-340, reading REDSIDE BLUESIDE. It is two-coloured in one continuous line: the left word is ' +
    'red and the right word is blue, with the change falling at the space between them. There is no red ' +
    'in the right portion and no blue in the left, and no blended or purple region where they meet — the ' +
    'two runs keep their own colours. Both words sit on the same baseline at the same size, so only ' +
    'colour distinguishes them, and nothing is drawn outside that line.',
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
setRichTextContent(
  field,
  parseTextMarkup('<font color="#ff0000">REDSIDE</font> <font color="#0000ff">BLUESIDE</font>'),
);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // LEFT third of the field should carry red glyphs.
  const leftRed = countColorPixels(at, isRed, FIELD_X + 6, FIELD_Y + 6, FIELD_W / 3, FIELD_H - 12);
  if (leftRed < 8) {
    throw new Error(`[text-multiformat] too few RED pixels in left third — got ${leftRed}, expected >= 8`);
  }

  // RIGHT third of the field should carry blue glyphs.
  const rightX = FIELD_X + (FIELD_W * 2) / 3;
  const rightBlue = countColorPixels(at, isBlue, rightX, FIELD_Y + 6, FIELD_W / 3 - 6, FIELD_H - 12);
  if (rightBlue < 8) {
    throw new Error(`[text-multiformat] too few BLUE pixels in right third — got ${rightBlue}, expected >= 8`);
  }

  // Cross-check: the left third must not be predominantly blue (would mean the ranges didn't apply).
  const leftBlue = countColorPixels(at, isBlue, FIELD_X + 6, FIELD_Y + 6, FIELD_W / 3, FIELD_H - 12);
  if (leftBlue > leftRed) {
    throw new Error(
      `[text-multiformat] left third is more blue than red (got ${leftBlue} blue vs ${leftRed} red) — ` +
        'format ranges did not color the two halves distinctly',
    );
  }
}

function countColorPixels(
  at: (x: number, y: number) => number,
  test: (rgb: number) => boolean,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number {
  let count = 0;
  for (let y = y0; y < y0 + h; y += 3) {
    for (let x = x0; x < x0 + w; x += 3) {
      if (test(at(x, y))) count++;
    }
  }
  return count;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Near red 0xff0000: high red, low green, low blue. Anti-aliased edges blend toward black, so lenient.
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) < 100 && channel(rgb, 0) < 100;
}
// Near blue 0x0000ff: low red, low green, high blue.
function isBlue(rgb: number): boolean {
  return channel(rgb, 16) < 100 && channel(rgb, 8) < 100 && channel(rgb, 0) > 150;
}
