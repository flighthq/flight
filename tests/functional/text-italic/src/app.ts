// text-italic — validates the italic slant of TextFormat: one RichText whose string carries a run of tall
// vertical glyphs (a repeated capital 'I') twice, side by side, with two format ranges of identical
// color and size — the first range italic, the second non-italic. Italic shears glyphs so that ink at the
// TOP of a glyph sits to the RIGHT of ink at the BOTTOM; an upright glyph keeps top and bottom ink
// vertically aligned.
//
// Slant is a render/transform concern (a shear applied to glyph outlines) that jsdom cannot exercise —
// only a real glyph render produces the lean. The oracle is FUZZY about exact glyph positions: each word
// occupies a known, non-overlapping x box. Within each box the oracle finds the ink's vertical extent,
// then measures the mean x of ink in the TOP scanline band vs the BOTTOM scanline band. For the italic
// box, top-band ink must be shifted RIGHT of bottom-band ink by a clear margin; for the non-italic box,
// top and bottom must stay roughly aligned. Fallback (noted, in case isolating top/bottom of a single
// glyph proves fragile across fonts): the assertion compares per-box top-vs-bottom shift rather than a
// single glyph, which is robust as long as the box contains upright/sheared strokes.
//
// API used: TextFormat.italic (true | false) plus shared color/size, applied per character span via
// setRichTextFormatRange(field, format, start, end). Both ranges set the same explicit color so slant is
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

const TEXT_COLOR = 0xffffff; // white — maximize contrast for ink detection
const FONT_SIZE = 72; // large and tall, so the top↔bottom slant offset is several pixels

const FIELD_X = 80;
const FIELD_Y = 230;
const FIELD_W = 640;
const FIELD_H = 140;

// Tall vertical glyphs whose strokes run the full glyph height — the shear shows clearly across height.
const WORD = 'IIII';
const TEXT = `${WORD} ${WORD}`;
const ITALIC_START = 0;
const ITALIC_END = WORD.length;
const REGULAR_START = WORD.length + 1; // after the space
const REGULAR_END = TEXT.length;

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

setRichTextFormatRange(field, { color: TEXT_COLOR, size: FONT_SIZE, italic: true }, ITALIC_START, ITALIC_END);
setRichTextFormatRange(field, { color: TEXT_COLOR, size: FONT_SIZE, italic: false }, REGULAR_START, REGULAR_END);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // The two words sit adjacent (left-aligned, separated by a space), not at fixed field thirds — so locate
  // them from the actual ink: scan column ink presence, find the ink x-extent, and split at the widest
  // empty gap (the space between the words). Left of the gap is the italic word, right is the upright one.
  const y0 = FIELD_Y + 4;
  const y1 = FIELD_Y + FIELD_H - 4;
  const colInk: boolean[] = [];
  let xMin = Infinity;
  let xMax = -Infinity;
  for (let x = FIELD_X; x < FIELD_X + FIELD_W; x++) {
    let hit = false;
    for (let y = y0; y < y1; y += 1) {
      if (isInk(at(x, y))) {
        hit = true;
        break;
      }
    }
    colInk[x] = hit;
    if (hit) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
  }
  if (xMax - xMin < 40) {
    throw new Error('[text-italic] too little ink to locate the two words');
  }
  let run = 0;
  let runStart = -1;
  let gapStart = -1;
  let gapLen = 0;
  for (let x = xMin; x <= xMax; x++) {
    if (!colInk[x]) {
      if (run === 0) runStart = x;
      run++;
      if (run > gapLen) {
        gapLen = run;
        gapStart = runStart;
      }
    } else {
      run = 0;
    }
  }
  if (gapLen < 4) {
    throw new Error('[text-italic] could not find the inter-word gap to separate italic from regular');
  }
  const gapMid = gapStart + Math.floor(gapLen / 2);

  const italic = measureSlant(at, xMin, gapMid);
  const regular = measureSlant(at, gapMid, xMax + 1);

  if (italic == null) {
    throw new Error('[text-italic] italic word had too little ink to measure slant');
  }
  if (regular == null) {
    throw new Error('[text-italic] regular word had too little ink to measure slant');
  }

  // Italic: top-band ink must lean RIGHT of bottom-band ink by a clear margin.
  const ITALIC_MIN_SHIFT = 4; // logical px; conservative for a 72px glyph
  if (italic.topMeanX - italic.bottomMeanX < ITALIC_MIN_SHIFT) {
    throw new Error(
      `[text-italic] italic word does not lean right — top-band mean x ${Math.round(italic.topMeanX)} is not ` +
        `>= bottom-band mean x ${Math.round(italic.bottomMeanX)} + ${ITALIC_MIN_SHIFT}`,
    );
  }

  // Non-italic control: top and bottom bands must stay roughly aligned (no strong lean either way).
  const REGULAR_MAX_SHIFT = 3;
  if (Math.abs(regular.topMeanX - regular.bottomMeanX) > REGULAR_MAX_SHIFT) {
    throw new Error(
      `[text-italic] non-italic control leans unexpectedly — top-band mean x ${Math.round(regular.topMeanX)} vs ` +
        `bottom-band mean x ${Math.round(regular.bottomMeanX)} differ by more than ${REGULAR_MAX_SHIFT}`,
    );
  }

  // Cross-check: the italic lean must be clearly stronger than any residual lean in the control.
  const italicShift = italic.topMeanX - italic.bottomMeanX;
  const regularShift = regular.topMeanX - regular.bottomMeanX;
  if (italicShift <= regularShift + 2) {
    throw new Error(
      `[text-italic] italic lean (${Math.round(italicShift)}) is not clearly greater than the control's ` +
        `lean (${Math.round(regularShift)})`,
    );
  }
}

// For the ink in a word box, finds the ink's vertical extent, then measures the mean x of ink in a band at
// the top of the extent and a band at the bottom. Returns null if there is too little ink to be reliable.
function measureSlant(
  at: (x: number, y: number) => number,
  xa: number,
  xb: number,
): { bottomMeanX: number; topMeanX: number } | null {
  const y0 = FIELD_Y + 4;
  const y1 = FIELD_Y + FIELD_H - 4;

  // First pass: vertical extent of any ink in this word's x-range.
  let minY = Infinity;
  let maxY = -Infinity;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = xa; x < xb; x += 2) {
      if (isInk(at(x, y))) {
        total++;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (total < 20 || maxY - minY < 12) return null;

  // Top and bottom bands, each a fraction of the glyph height inset from the very edges (the extreme tips
  // of antialiased terminals are noisy).
  const span = maxY - minY;
  const bandH = Math.max(3, Math.round(span * 0.18));
  const inset = Math.max(2, Math.round(span * 0.08));
  const topMeanX = bandMeanX(at, xa, xb, minY + inset, bandH);
  const bottomMeanX = bandMeanX(at, xa, xb, maxY - inset - bandH, bandH);
  if (topMeanX == null || bottomMeanX == null) return null;

  return { bottomMeanX, topMeanX };
}

// Mean x of ink samples within a horizontal band [bandY, bandY+bandH) across [xa, xb).
function bandMeanX(
  at: (x: number, y: number) => number,
  xa: number,
  xb: number,
  bandY: number,
  bandH: number,
): number | null {
  let count = 0;
  let sumX = 0;
  for (let y = bandY; y < bandY + bandH; y += 1) {
    for (let x = xa; x < xb; x += 1) {
      if (isInk(at(x, y))) {
        count++;
        sumX += x;
      }
    }
  }
  return count > 0 ? sumX / count : null;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// White text on black: any reasonably bright pixel is ink. Mid threshold counts partial coverage without
// picking up the pure-black background.
function isInk(rgb: number): boolean {
  return channel(rgb, 16) > 90 && channel(rgb, 8) > 90 && channel(rgb, 0) > 90;
}
