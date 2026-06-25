// text-basic — validates that a RichText display object actually rasterizes glyphs: a short string in
// a bright color at a large font size appears as colored pixels inside the field's box, while a far-away
// empty region of the opaque background stays clear.
//
// Text rendering is a distinct pipeline from shapes (glyph layout + per-glyph raster) and is inherently
// visual — jsdom cannot measure or paint glyphs, so only a real render proves the field draws. Glyph
// positions depend on font metrics, so the oracle is deliberately FUZZY: it scans the field's bounding
// region and asserts that several pixels land near the text color (text was drawn), and that a region
// well outside the field has none (the field did not flood the screen).
import type { Surface } from '@flighthq/sdk';
import { addNodeChild, createDisplayContainer, createRichText, getSurfacePixelRgb, RichTextKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Bright amber text on black. The field box is placed at a known location; the string is short so it fits.
const TEXT_COLOR = 0xffcc00;
const FIELD_X = 120;
const FIELD_Y = 180;
const FIELD_W = 420;
const FIELD_H = 120;
const FONT_SIZE = 72;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true };
field.data.textColor = TEXT_COLOR;
field.data.multiline = false;
field.data.wordWrap = false;
field.x = FIELD_X;
field.y = FIELD_Y;
field.data.width = FIELD_W;
field.data.height = FIELD_H;
field.data.text = 'Flight';
addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Scan a grid covering the field's box (with a small inset so the field border, if any, is excluded)
  // and count pixels near the text color. Glyphs are sparse, so even a few hits prove text rendered.
  const hits = countTextColorPixels(at, FIELD_X + 8, FIELD_Y + 8, FIELD_W - 16, FIELD_H - 16);
  if (hits < 12) {
    throw new Error(`[text-basic] too few text-colored pixels in field region — got ${hits}, expected >= 12`);
  }

  // A clearly-empty band along the bottom of the stage must contain NO text-colored pixels.
  const stray = countTextColorPixels(at, 0, HEIGHT - 60, WIDTH, 50);
  if (stray > 0) {
    throw new Error(`[text-basic] text color found in empty bottom region — got ${stray}, expected 0`);
  }
}

// Counts pixels within `region` (logical coords) whose channels are near TEXT_COLOR. Steps by a few
// logical pixels so the scan stays cheap while still catching sparse glyph strokes.
function countTextColorPixels(
  at: (x: number, y: number) => number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number {
  let count = 0;
  for (let y = y0; y < y0 + h; y += 3) {
    for (let x = x0; x < x0 + w; x += 3) {
      if (isTextColor(at(x, y))) count++;
    }
  }
  return count;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Near amber 0xffcc00: high red, mid-high green, low blue. Anti-aliased edges blend toward black, so
// the thresholds are lenient — any pixel clearly carrying the amber hue counts.
function isTextColor(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) > 110 && channel(rgb, 0) < 100;
}
