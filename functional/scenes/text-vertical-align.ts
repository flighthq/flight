// text-vertical-align — validates block-level VERTICAL text alignment: three RichText fields of the
// SAME fixed width AND height carry the SAME short bright text, but one uses verticalAlign='top', one
// 'middle', and one 'bottom'. The text is far shorter than the field height, so each box has vertical
// slack: top text hugs the box top, middle text sits around the box's vertical midline, and bottom
// text drops to the box bottom.
//
// Vertical alignment is a layout decision (where the whole text block is placed within the field's
// height box) that jsdom cannot exercise — only a real glyph render reveals where the ink lands. The
// oracle is FUZZY about exact glyph positions: per field it scans every sampled column for ink
// (text-colored) rows, accumulates them, and computes the ink VERTICAL centroid relative to the field's
// top. It then asserts top < middle < bottom (clearly separated), with the top block near the box top,
// the middle block near the box center, and the bottom block near the box bottom. No exact pixel is asserted.
//
// API used: RichText.data.verticalAlign ('top' | 'middle' | 'bottom'); plus data.text/width/height/
// textColor and a shared FONT_SIZE.
import type { Surface } from '@flighthq/sdk';
import { addNodeChild, createDisplayContainer, createRichText, getSurfacePixelRgb, RichTextKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const TEXT_COLOR = 0xffcc33; // bright amber
const TEXT = 'FLIGHT'; // short single line — far less than the field height, so slack is visible
const FONT_SIZE = 44;

// All three fields share x/width/height so their alignment boxes are identical; only verticalAlign differs.
const FIELD_X = 100;
const FIELD_W = 600;
const FIELD_H = 150;
const TOP_FIELD_Y = 30; // verticalAlign='top'
const MIDDLE_FIELD_Y = 220; // verticalAlign='middle'
const BOTTOM_FIELD_Y = 410; // verticalAlign='bottom'

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

function makeField(y: number, verticalAlign: 'bottom' | 'middle' | 'top') {
  const field = createRichText();
  field.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true };
  field.data.textColor = TEXT_COLOR;
  field.data.multiline = true;
  field.data.verticalAlign = verticalAlign;
  field.x = FIELD_X;
  field.y = y;
  field.data.width = FIELD_W;
  field.data.height = FIELD_H;
  field.data.text = TEXT;
  addNodeChild(root, field);
}

makeField(TOP_FIELD_Y, 'top');
makeField(MIDDLE_FIELD_Y, 'middle');
makeField(BOTTOM_FIELD_Y, 'bottom');

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const top = measureInk(at, TOP_FIELD_Y);
  const middle = measureInk(at, MIDDLE_FIELD_Y);
  const bottom = measureInk(at, BOTTOM_FIELD_Y);

  for (const [name, m] of [
    ['top', top],
    ['middle', middle],
    ['bottom', bottom],
  ] as const) {
    if (m.count < 12) {
      throw new Error(`[text-vertical-align] ${name} field has too little ink — got ${m.count}, expected >= 12`);
    }
  }

  // Centroids are measured relative to each field's top edge, so they are directly comparable.
  // Top block near the box top, middle near the center, bottom near the box bottom.
  if (top.centroidY > FIELD_H * 0.4) {
    throw new Error(
      `[text-vertical-align] top-aligned ink centroid (${Math.round(top.centroidY)}) is not near the box top ` +
        `(expected <= ${Math.round(FIELD_H * 0.4)})`,
    );
  }
  if (Math.abs(middle.centroidY - FIELD_H / 2) > FIELD_H * 0.2) {
    throw new Error(
      `[text-vertical-align] middle-aligned ink centroid (${Math.round(middle.centroidY)}) is not near the box ` +
        `center (${FIELD_H / 2}); tolerance ${Math.round(FIELD_H * 0.2)}`,
    );
  }
  if (bottom.centroidY < FIELD_H * 0.6) {
    throw new Error(
      `[text-vertical-align] bottom-aligned ink centroid (${Math.round(bottom.centroidY)}) is not near the box ` +
        `bottom (expected >= ${Math.round(FIELD_H * 0.6)})`,
    );
  }

  // Strict ordering with a clear margin: the three blocks descend within their identical boxes.
  const margin = FIELD_H * 0.15;
  if (middle.centroidY <= top.centroidY + margin) {
    throw new Error(
      `[text-vertical-align] middle centroid (${Math.round(middle.centroidY)}) is not clearly below top ` +
        `(${Math.round(top.centroidY)})`,
    );
  }
  if (bottom.centroidY <= middle.centroidY + margin) {
    throw new Error(
      `[text-vertical-align] bottom centroid (${Math.round(bottom.centroidY)}) is not clearly below middle ` +
        `(${Math.round(middle.centroidY)})`,
    );
  }
}

// Scans the field's box, accumulating ink (text-colored) sample points, and returns the count plus the
// vertical centroid (mean y of ink samples) RELATIVE to the field's top edge.
function measureInk(at: (x: number, y: number) => number, fieldY: number): { centroidY: number; count: number } {
  let count = 0;
  let sumY = 0;
  for (let y = fieldY; y < fieldY + FIELD_H; y += 2) {
    for (let x = FIELD_X; x < FIELD_X + FIELD_W; x += 2) {
      if (isInk(at(x, y))) {
        count++;
        sumY += y - fieldY;
      }
    }
  }
  return { centroidY: count > 0 ? sumY / count : FIELD_H / 2, count };
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Near amber 0xffcc33: high red, mid-high green, low blue. Anti-aliased edges blend toward black, so
// thresholds are lenient — any clearly non-black warm pixel counts as ink.
function isInk(rgb: number): boolean {
  return channel(rgb, 16) > 120 && channel(rgb, 8) > 80 && channel(rgb, 0) < 140;
}
