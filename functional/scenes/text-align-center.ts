// text-align-center — validates horizontal text alignment: two RichText fields of the SAME fixed width
// carry the SAME short bright text, but one uses defaultTextFormat.align='left' and the other
// align='center'. Centered text starts further right and sits around the field's horizontal midpoint;
// left-aligned text hugs the field's left edge.
//
// Alignment is a layout decision (where the text run is placed within the field's width box) that jsdom
// cannot exercise — only a real glyph render reveals where the ink lands. The scene assertion is FUZZY about exact
// glyph positions: per field it scans every sampled row for the leftmost and rightmost "ink"
// (text-colored) columns, accumulates them, and computes the ink horizontal CENTROID. It then asserts the
// centered field's centroid is clearly RIGHT of the left field's centroid AND near the field's horizontal
// center, and that the left field's ink begins near the field's left edge. No exact pixel is asserted.
//
// API used: TextFormat.align ('left' | 'center'), applied via field.data.defaultTextFormat; plus
// field.data.text/width/height/textColor and a shared FONT_SIZE.
import type { Bitmap } from '@flighthq/sdk';
import { addNodeChild, createDisplayObject, createRichText, getBitmapPixelRgb, RichTextKind } from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

// ★ FRAMED AROUND THE SUBJECT, DELIBERATELY. The frame holds the fields plus a small margin rather
// than floating them in an 800x600 field that was mostly empty. The empty field is not free: the
// regression gate scores a change as a MEAN over the whole frame, so padding dilutes every defect by
// the ratio of the areas — measured across this family, moving the whole picture one fingerprint cell
// scored 0.79-1.78 at 800x600 and 4.79-30.10 over the subject's own bounding box.
// ★ WHAT IS NOT TOUCHED: the FIELD width, which is the measure alignment is relative to and therefore
// part of the subject, and the gap between the two fields, which keeps them separately measurable.
const WIDTH = 520;
const HEIGHT = 360;

const TEXT_COLOR = 0xffcc33ff; // bright amber
const TEXT = 'FLIGHT'; // short, so it occupies far less than the field width — alignment is visible
const FONT_SIZE = 64;

// Both fields share width/x so their alignment boxes are identical; only align differs.
const FIELD_X = 20;
const FIELD_W = 480;
const FIELD_H = 110;
const LEFT_FIELD_Y = 20; // align='left'
const CENTER_FIELD_Y = 190; // align='center'

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [RichTextKind],
  expectedImageDescription:
    'A 520x360 opaque black field showing the same short word, FLIGHT, twice in bright amber at about ' +
    '64 px, in two 480-wide boxes that both start at x 20 — the first at y 20-130, the second at ' +
    'y 190-300. The two differ only in where the word sits across its box, and that difference is the ' +
    'entire picture. The upper word starts at the left edge of its box, near x 20, with one wide empty ' +
    'gap to its right. The lower word is centred: it has roughly EQUAL empty margins on both sides, so ' +
    'its first glyph begins well right of x 20 and its last ends well left of x 500. Two words beginning ' +
    'at the same x, or a lower word pushed to one side, is the failure. Both are amber on pure black with ' +
    'no box, border or underline, and neither wraps to a second line.',
});

const root = createDisplayObject();

const leftField = createRichText();
leftField.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true, align: 'left' };
leftField.data.textColor = TEXT_COLOR;
leftField.data.multiline = true;
leftField.data.wordWrap = true;
leftField.x = FIELD_X;
leftField.y = LEFT_FIELD_Y;
leftField.data.width = FIELD_W;
leftField.data.height = FIELD_H;
leftField.data.text = TEXT;
addNodeChild(root, leftField);

const centerField = createRichText();
centerField.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true, align: 'center' };
centerField.data.textColor = TEXT_COLOR;
centerField.data.multiline = true;
centerField.data.wordWrap = true;
centerField.x = FIELD_X;
centerField.y = CENTER_FIELD_Y;
centerField.data.width = FIELD_W;
centerField.data.height = FIELD_H;
centerField.data.text = TEXT;
addNodeChild(root, centerField);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const left = measureInk(at, LEFT_FIELD_Y);
  const center = measureInk(at, CENTER_FIELD_Y);

  if (left.count < 12) {
    throw new Error(`[text-align-center] left field has too little ink — got ${left.count}, expected >= 12`);
  }
  if (center.count < 12) {
    throw new Error(`[text-align-center] center field has too little ink — got ${center.count}, expected >= 12`);
  }

  // Left-aligned ink must begin near the field's left edge.
  const leftEdgeTolerance = FIELD_W * 0.2;
  if (left.minX > FIELD_X + leftEdgeTolerance) {
    throw new Error(
      `[text-align-center] left-aligned ink does not start near the field's left edge — ` +
        `leftmost ink x=${Math.round(left.minX)}, expected <= ${Math.round(FIELD_X + leftEdgeTolerance)}`,
    );
  }

  // Centered centroid must be clearly to the right of the left-aligned centroid.
  if (center.centroidX <= left.centroidX + FIELD_W * 0.12) {
    throw new Error(
      `[text-align-center] centered centroid (${Math.round(center.centroidX)}) is not clearly right of ` +
        `left-aligned centroid (${Math.round(left.centroidX)})`,
    );
  }

  // Centered centroid must sit near the field's horizontal center.
  const fieldCenterX = FIELD_X + FIELD_W / 2;
  const centerTolerance = FIELD_W * 0.18;
  if (Math.abs(center.centroidX - fieldCenterX) > centerTolerance) {
    throw new Error(
      `[text-align-center] centered centroid (${Math.round(center.centroidX)}) is not near field center ` +
        `(${fieldCenterX}); tolerance ${Math.round(centerTolerance)}`,
    );
  }
}

// Scans the field's full width across its vertical extent, accumulating ink (text-colored) sample points.
// Returns the count, the leftmost ink x, and the horizontal centroid (mean x of ink samples).
function measureInk(
  at: (x: number, y: number) => number,
  fieldY: number,
): { centroidX: number; count: number; minX: number } {
  let count = 0;
  let sumX = 0;
  let minX = Infinity;
  for (let y = fieldY + 6; y < fieldY + FIELD_H - 6; y += 3) {
    for (let x = FIELD_X; x < FIELD_X + FIELD_W; x += 2) {
      if (isInk(at(x, y))) {
        count++;
        sumX += x;
        if (x < minX) minX = x;
      }
    }
  }
  return { centroidX: count > 0 ? sumX / count : FIELD_X, count, minX: count > 0 ? minX : FIELD_X };
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Near amber 0xffcc33: high red, mid-high green, low blue. Anti-aliased edges blend toward black, so
// thresholds are lenient — any clearly non-black warm pixel counts as ink.
function isInk(rgb: number): boolean {
  return channel(rgb, 16) > 120 && channel(rgb, 8) > 80 && channel(rgb, 0) < 140;
}
