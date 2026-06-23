// text-bold — validates the bold weight of TextFormat: one RichText whose string carries the SAME word
// twice, side by side, with two format ranges of identical color and size — the first range bold, the
// second regular. Bold glyphs have thicker strokes, so the bold word lays down measurably MORE ink than
// the regular word over an equal-area box.
//
// Font weight is a render concern (heavier strokes) that jsdom cannot exercise — only a real glyph render
// produces the extra coverage. The oracle is FUZZY about exact glyph positions: the two words are placed
// at known, non-overlapping x ranges, so a box can be drawn around each. It COUNTS ink (non-background)
// pixels in the bold box and in the regular box and asserts the bold box has at least 15% more ink. No
// exact glyph pixel is asserted; only the relative coverage of the two boxes matters.
//
// API used: TextFormat.bold (true | false) plus shared color/size, applied per character span via
// setRichTextFormatRange(field, format, start, end). Both ranges set the same explicit color so weight is
// the only difference.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayContainer,
  createRichText,
  getSurfacePixelRgb,
  RichTextKind,
  setRichTextFormatRange,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const TEXT_COLOR = 0xffffff; // white — maximize contrast against the black background for ink counting
const FONT_SIZE = 56;

const FIELD_X = 80;
const FIELD_Y = 240;
const FIELD_W = 640;
const FIELD_H = 120;

// Two identical words, separated by a space. The bold range covers the first word, the regular range the
// second. Equal letters means any ink difference is weight, not glyph shape.
const WORD = 'WEIGHT';
const TEXT = `${WORD} ${WORD}`;
const BOLD_START = 0;
const BOLD_END = WORD.length;
const REGULAR_START = WORD.length + 1; // after the space
const REGULAR_END = TEXT.length;

// The field is split into a left box (bold word) and a right box (regular word). A center gutter is left
// unscanned because the exact boundary between the two words depends on glyph metrics.
const BOX_W = FIELD_W * 0.42;
const BOLD_BOX_X = FIELD_X + 8;
const REGULAR_BOX_X = FIELD_X + FIELD_W - 8 - BOX_W;

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
field.data.multiline = false;
field.data.wordWrap = false;
field.x = FIELD_X;
field.y = FIELD_Y;
field.data.width = FIELD_W;
field.data.height = FIELD_H;
field.data.text = TEXT;

setRichTextFormatRange(field, { color: TEXT_COLOR, size: FONT_SIZE, bold: true }, BOLD_START, BOLD_END);
setRichTextFormatRange(field, { color: TEXT_COLOR, size: FONT_SIZE, bold: false }, REGULAR_START, REGULAR_END);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const boldInk = countInk(at, BOLD_BOX_X, FIELD_Y + 6, BOX_W, FIELD_H - 12);
  const regularInk = countInk(at, REGULAR_BOX_X, FIELD_Y + 6, BOX_W, FIELD_H - 12);

  if (boldInk < 20) {
    throw new Error(`[text-bold] bold word box has too little ink — got ${boldInk}, expected >= 20`);
  }
  if (regularInk < 20) {
    throw new Error(`[text-bold] regular word box has too little ink — got ${regularInk}, expected >= 20`);
  }

  // Bold strokes are thicker, so the bold box must carry measurably more ink than the regular box.
  if (boldInk < regularInk * 1.15) {
    throw new Error(
      `[text-bold] bold word is not measurably heavier than the regular word — ` +
        `bold ink ${boldInk} vs regular ink ${regularInk} (need bold >= 1.15x regular)`,
    );
  }
}

// Counts ink (non-background) sample points in a box.
function countInk(at: (x: number, y: number) => number, x0: number, y0: number, w: number, h: number): number {
  let count = 0;
  for (let y = y0; y < y0 + h; y += 2) {
    for (let x = x0; x < x0 + w; x += 2) {
      if (isInk(at(x, y))) count++;
    }
  }
  return count;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// White text on black: any reasonably bright pixel is ink. Anti-aliased edges blend toward black, so a
// mid threshold counts partial coverage without picking up the pure-black background.
function isInk(rgb: number): boolean {
  return channel(rgb, 16) > 90 && channel(rgb, 8) > 90 && channel(rgb, 0) > 90;
}
