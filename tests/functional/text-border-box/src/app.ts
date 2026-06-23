// text-border-box — validates the RichText field border stroke: with data.border = true and
// data.borderColor set, the renderer strokes the field box edges (data.width x data.height at the field
// origin) with that color. Purely visual — the stroke is a renderer concern, not part of layout — so only a
// real render proves it drew.
//
// BACKEND NOTE: all four RichText renderers (canvas, dom, gl, wgpu) draw the border when data.border is
// true, so this test runs on all backends. The stroke geometry differs slightly per backend — canvas/gl/
// wgpu use a 1px strokeRect centered on the box path; dom uses a CSS `1px solid` border on the inside edge
// — so the oracle scans a small BAND straddling the top edge rather than a single exact scanline, and uses
// a lenient color test (a thin anti-aliased stroke blends toward black). Background fill is left OFF so the
// border color is the only non-black thing along the edge.
//
// Oracle (band scan + gap/exterior checks): autoSize is 'none', so the box is exactly FIELD_X..FIELD_X+
// FIELD_W by FIELD_Y..FIELD_Y+FIELD_H. We scan a few-px band around the TOP edge (y = FIELD_Y) across the
// field width and require a meaningful count of border-colored pixels — the top stroke. We then assert the
// INTERIOR (a glyph-free point well inside the box) and the EXTERIOR (a point well outside) are NOT the
// border color, so the stroke is confined to the edge. Counts/tolerances are generous because we cannot run
// a browser and the stroke is one device-pixel thin.
import type { Surface } from '@flighthq/sdk';
import { addNodeChild, createDisplayContainer, createRichText, getSurfacePixelRgb, RichTextKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const BORDER_R = 0x88;
const BORDER_G = 0xcc;
const BORDER_B = 0xff;
const BORDER_COLOR = (BORDER_R << 16) | (BORDER_G << 8) | BORDER_B; // 0x88ccff, a light blue
const FIELD_X = 200;
const FIELD_Y = 180;
const FIELD_W = 400;
const FIELD_H = 240;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

// Empty text: the border (and background, if any) still draws on every backend even with no glyphs. Keeping
// the field text-free guarantees the interior gap sample cannot accidentally hit glyph ink.
const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: 40 };
field.data.multiline = false;
field.data.wordWrap = false;
field.x = FIELD_X;
field.y = FIELD_Y;
field.data.width = FIELD_W;
field.data.height = FIELD_H;
field.data.background = false;
field.data.border = true;
field.data.borderColor = BORDER_COLOR;
field.data.text = '';

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Scan a small band straddling the TOP edge for border-colored pixels.
  let borderHits = 0;
  for (let dy = -2; dy <= 3; dy += 1) {
    const y = FIELD_Y + dy;
    for (let x = FIELD_X + 4; x < FIELD_X + FIELD_W - 4; x += 4) {
      if (isBorder(at(x, y))) borderHits++;
    }
  }
  if (borderHits < 12) {
    throw new Error(
      `[text-border-box] too few border-colored pixels along the top edge (${borderHits} hits, expected ` +
        `>= 12) — the field border stroke does not appear to be drawn`,
    );
  }

  // INTERIOR: a point well inside the box, away from every edge, must NOT be the border color (it should be
  // the black scene showing through, since background is off).
  const inside = at(FIELD_X + FIELD_W / 2, FIELD_Y + FIELD_H / 2);
  if (isBorder(inside)) {
    throw new Error(
      `[text-border-box] interior sample is border-colored ${hex(inside)} — the border is not confined to ` +
        'the edge (looks like a fill, not a stroke)',
    );
  }

  // EXTERIOR: a point well outside the box must NOT be the border color.
  const outside = at(FIELD_X - 60, FIELD_Y - 60);
  if (isBorder(outside)) {
    throw new Error(
      `[text-border-box] exterior sample is border-colored ${hex(outside)} — the border stroke is leaking ` +
        'outside the field box',
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Light blue 0x88ccff: a thin anti-aliased stroke blends toward black, so accept anything clearly bluish-
// bright (notable green and blue, blue >= green-ish) while rejecting pure black and pure white.
function isBorder(rgb: number): boolean {
  const r = channel(rgb, 16);
  const g = channel(rgb, 8);
  const b = channel(rgb, 0);
  return b > 90 && g > 70 && b >= r && g >= r - 20 && !(r > 200 && g > 200 && b > 200);
}
function hex(rgb: number): string {
  return '0x' + (rgb >>> 0).toString(16).padStart(6, '0');
}
