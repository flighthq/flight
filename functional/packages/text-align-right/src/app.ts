// text-align-right — validates right-edge text alignment: a right-aligned RichText is compared against a
// left-aligned control of the SAME width and SAME short text. Right-aligned text pushes its ink against
// the field's right edge, leaving the left portion of the field empty; the control's ink instead begins
// at the field's left edge.
//
// Alignment is a layout decision (where the text run is placed within the field's width box) that jsdom
// cannot exercise — only a real glyph render reveals where the ink lands. The oracle is FUZZY about exact
// glyph positions: it scans each field for the rightmost and leftmost ink (text-colored) columns and
// counts ink in the left third. For the right-aligned field it asserts the rightmost ink is near the
// field's right edge AND the left third is empty (background). For the control it asserts ink starts at
// the left. No exact glyph pixel is asserted.
//
// API used: TextFormat.align ('right' | 'left'), applied via field.data.defaultTextFormat; plus
// field.data.text/width/height/textColor and a shared FONT_SIZE.
import type { Surface } from '@flighthq/sdk';
import { addNodeChild, createDisplayContainer, createRichText, getSurfacePixelRgb, RichTextKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const TEXT_COLOR = 0x66ff66; // bright green
const TEXT = 'FLIGHT'; // short, so it occupies far less than the field width — alignment is visible
const FONT_SIZE = 64;

// Both fields share width/x so their alignment boxes are identical; only align differs.
const FIELD_X = 160;
const FIELD_W = 480;
const FIELD_H = 110;
const RIGHT_FIELD_Y = 120; // align='right'
const CONTROL_FIELD_Y = 320; // align='left' control

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

const rightField = createRichText();
rightField.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true, align: 'right' };
rightField.data.textColor = TEXT_COLOR;
rightField.data.multiline = true;
rightField.data.wordWrap = true;
rightField.x = FIELD_X;
rightField.y = RIGHT_FIELD_Y;
rightField.data.width = FIELD_W;
rightField.data.height = FIELD_H;
rightField.data.text = TEXT;
addNodeChild(root, rightField);

const controlField = createRichText();
controlField.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true, align: 'left' };
controlField.data.textColor = TEXT_COLOR;
controlField.data.multiline = true;
controlField.data.wordWrap = true;
controlField.x = FIELD_X;
controlField.y = CONTROL_FIELD_Y;
controlField.data.width = FIELD_W;
controlField.data.height = FIELD_H;
controlField.data.text = TEXT;
addNodeChild(root, controlField);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const right = measureInk(at, RIGHT_FIELD_Y);
  const control = measureInk(at, CONTROL_FIELD_Y);

  if (right.count < 12) {
    throw new Error(`[text-align-right] right field has too little ink — got ${right.count}, expected >= 12`);
  }
  if (control.count < 12) {
    throw new Error(`[text-align-right] control field has too little ink — got ${control.count}, expected >= 12`);
  }

  // Right-aligned ink must reach near the field's right edge.
  const rightEdgeTolerance = FIELD_W * 0.2;
  const fieldRightX = FIELD_X + FIELD_W;
  if (right.maxX < fieldRightX - rightEdgeTolerance) {
    throw new Error(
      `[text-align-right] right-aligned ink does not reach the field's right edge — ` +
        `rightmost ink x=${Math.round(right.maxX)}, expected >= ${Math.round(fieldRightX - rightEdgeTolerance)}`,
    );
  }

  // Right-aligned field's left third must be empty (background).
  if (right.leftThirdInk > 2) {
    throw new Error(
      `[text-align-right] right-aligned field has ink in its left third (${right.leftThirdInk}) — ` +
        'text was not pushed to the right',
    );
  }

  // The left-aligned control must instead begin at the field's left edge.
  const leftEdgeTolerance = FIELD_W * 0.2;
  if (control.minX > FIELD_X + leftEdgeTolerance) {
    throw new Error(
      `[text-align-right] control (left-aligned) ink does not start near the left edge — ` +
        `leftmost ink x=${Math.round(control.minX)}, expected <= ${Math.round(FIELD_X + leftEdgeTolerance)}`,
    );
  }
}

// Scans the field's full width across its vertical extent. Returns ink sample count, leftmost/rightmost
// ink x, and how many ink samples fell in the field's left third.
function measureInk(
  at: (x: number, y: number) => number,
  fieldY: number,
): { count: number; leftThirdInk: number; maxX: number; minX: number } {
  let count = 0;
  let leftThirdInk = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  const leftThirdEnd = FIELD_X + FIELD_W / 3;
  for (let y = fieldY + 6; y < fieldY + FIELD_H - 6; y += 3) {
    for (let x = FIELD_X; x < FIELD_X + FIELD_W; x += 2) {
      if (isInk(at(x, y))) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (x < leftThirdEnd) leftThirdInk++;
      }
    }
  }
  return {
    count,
    leftThirdInk,
    maxX: count > 0 ? maxX : FIELD_X,
    minX: count > 0 ? minX : FIELD_X + FIELD_W,
  };
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Near green 0x66ff66: mid red, high green, mid blue. Anti-aliased edges blend toward black, so the
// green channel dominating is the lenient ink test.
function isInk(rgb: number): boolean {
  return channel(rgb, 8) > 130 && channel(rgb, 16) < 200 && channel(rgb, 0) < 200;
}
