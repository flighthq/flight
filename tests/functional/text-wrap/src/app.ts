// text-wrap — validates word-wrap + multiline layout: a long sentence in a fixed, narrow field with
// wordWrap=true and multiline=true must break onto at least two lines, so colored pixels appear in two
// separate horizontal bands stacked vertically.
//
// Wrapping is a layout decision (where line breaks fall given a width constraint) that jsdom cannot
// exercise — only a real glyph render reveals it. The oracle is FUZZY about exact glyph positions: it
// counts text-colored pixels in a band near the FIRST line's baseline area and in a second band well
// BELOW it. Hits in both bands prove the text occupied two lines, i.e. it wrapped. The vertical gap
// between the bands is wide enough that a single line of this font size could not span both.
import type { Surface } from '@flighthq/sdk';
import { addNodeChild, createDisplayContainer, createRichText, getSurfacePixelRgb, RichTextKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const TEXT_COLOR = 0x33ccff; // bright cyan-blue
const FIELD_X = 120;
const FIELD_Y = 120;
// Narrow field: at size 30 this sentence is far wider than 260px, forcing several wrapped lines.
const FIELD_W = 260;
const FIELD_H = 360;
const FONT_SIZE = 30;

// Vertical centers (logical y) of the two scan bands. The first sits over the top line; the second is
// ~5 lines down — comfortably below where line 1 can reach, so a hit there means a later wrapped line.
const BAND1_Y = FIELD_Y + 24;
const BAND2_Y = FIELD_Y + 170;
const BAND_HALF_HEIGHT = 14;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE };
field.data.textColor = TEXT_COLOR;
field.data.multiline = true;
field.data.wordWrap = true;
field.x = FIELD_X;
field.y = FIELD_Y;
field.data.width = FIELD_W;
field.data.height = FIELD_H;
field.data.text =
  'The quick brown fox jumps over the lazy dog while the morning sun rises slowly above the distant hills.';
addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const band1 = countTextColorPixelsInBand(at, FIELD_X + 4, FIELD_W - 8, BAND1_Y);
  if (band1 < 8) {
    throw new Error(`[text-wrap] first line band has too few text pixels — got ${band1}, expected >= 8`);
  }

  const band2 = countTextColorPixelsInBand(at, FIELD_X + 4, FIELD_W - 8, BAND2_Y);
  if (band2 < 8) {
    throw new Error(
      `[text-wrap] second (wrapped) line band has too few text pixels — got ${band2}, expected >= 8 ` +
        '(text did not wrap to a lower line)',
    );
  }
}

// Counts text-colored pixels in a horizontal band centered on `centerY`, scanning the full field width.
function countTextColorPixelsInBand(
  at: (x: number, y: number) => number,
  x0: number,
  w: number,
  centerY: number,
): number {
  let count = 0;
  for (let y = centerY - BAND_HALF_HEIGHT; y <= centerY + BAND_HALF_HEIGHT; y += 2) {
    for (let x = x0; x < x0 + w; x += 2) {
      if (isTextColor(at(x, y))) count++;
    }
  }
  return count;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Near cyan-blue 0x33ccff: low-ish red, high green, high blue. Anti-aliased edges blend toward black,
// so thresholds are lenient.
function isTextColor(rgb: number): boolean {
  return channel(rgb, 16) < 150 && channel(rgb, 8) > 120 && channel(rgb, 0) > 150;
}
