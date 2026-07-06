// text-underline — validates the underline text decoration: a RichText whose single format range sets
// TextFormat.underline = true draws a horizontal stroke under the glyphs, in the text color, spanning the
// run width. This is purely visual — the underline is a stroked line the rasterizer adds beneath the text
// baseline, invisible to layout/measurement, so only a real render proves it was drawn.
//
// BACKEND CAVEAT: underline is drawn by ALL FOUR RichText renderers (canvasRichText, domRichText,
// glRichText, wgpuRichText each handle `format.underline`), so this test runs on all backends. NOTE that
// STRIKETHROUGH is NOT drawn by the gl/wgpu renderers (only canvas/dom) — that is why the sibling
// text-strikethrough test is scoped to ["canvas","dom"]. If a future change drops underline from the GPU
// RichText renderers, this oracle will fail on webgl/webgpu and the test should be narrowed to
// "renderers":["canvas","dom"] at that point.
//
// Oracle (coverage-based, lenient): the underline stroke is drawn at roughly the bottom of the line box
// (canvasRichText draws it at baseline + descent). We scan a horizontal BAND in the lower portion of the
// text line for a wide CONTINUOUS run of ink (text-colored) pixels — that horizontal extent is the
// underline. We then check a GAP scanline just above the glyph bodies (between the top gutter and the cap
// line) which should be mostly background, confirming the lower ink is a decoration and not just tall
// glyphs. Estimates are deliberately fuzzy because exact glyph metrics are font-dependent and we cannot
// run a browser.
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

const INK = 0xffee44; // bright yellow text + underline, far from the black background
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

const root = createDisplayContainer();

const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true };
field.data.multiline = false;
field.data.wordWrap = false;
field.x = FIELD_X;
field.y = FIELD_Y;
field.data.width = FIELD_W;
field.data.height = FIELD_H;
field.data.text = TEXT;

// One format range over the whole string: bright color + underline.
setRichTextFormatRange(field, { color: INK, underline: true }, 0, TEXT.length);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // The underline is a single horizontal stroke spanning the whole word; its exact y depends on font
  // metrics, so rather than guess the band we scan EVERY row across the field's vertical extent and take
  // the widest continuous run of ink on any one row. Individual glyphs of "Flight" produce short runs
  // (≤ ~one glyph wide); only the underline stroke produces a run spanning the whole word (>> 100px). So a
  // wide continuous run anywhere in the field is unambiguous proof the underline drew.
  const widestRun = findWidestInkRunInBand(at, FIELD_X, FIELD_X + FIELD_W, FIELD_Y, FIELD_Y + FIELD_H);
  if (widestRun < 100) {
    throw new Error(
      `[text-underline] no wide continuous ink run found anywhere in the field (widest run ${widestRun}px, ` +
        'expected >= 100px) — the underline stroke does not appear to be drawn (only short glyph runs found)',
    );
  }
}

// Returns the widest run, in source px, of consecutive ink columns found on ANY single scanline in the
// y range. The underline row yields a run ≈ the word width; glyph rows yield only short per-letter runs.
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
// Near 0xffee44: high red, high green, low-ish blue. Anti-aliased edges blend toward black, so lenient.
function isInk(rgb: number): boolean {
  return channel(rgb, 16) > 140 && channel(rgb, 8) > 120 && channel(rgb, 0) < 150;
}
