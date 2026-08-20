// text-background-box — validates the RichText field background fill: with data.background = true and
// data.backgroundColor set, the renderer fills the whole field box (data.width x data.height at the field
// origin) with that color before drawing text. Purely visual — the fill is a renderer concern, not part of
// layout — so only a real render proves the box painted.
//
// BACKEND NOTE: all four RichText renderers (canvas, dom, gl, wgpu) draw the background fill when
// data.background is true, so this test runs on all backends.
//
// Scene assertion (point samples): the field is at a known x/y with a known width/height and autoSize 'none', so the
// box is exactly FIELD_X..FIELD_X+FIELD_W by FIELD_Y..FIELD_Y+FIELD_H. We sample a point INSIDE the box but
// far from any glyph ink (the lower-right interior, below a short single line of text) and assert it is the
// backgroundColor — proving the box painted. We then sample a point well OUTSIDE the box and assert it is
// the black scene background — proving the fill is bounded to the field. Lenient color tests tolerate
// anti-aliasing only at edges; the sampled points are interior, so they should be the solid fill.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createRichText,
  getBitmapPixelRgb,
  RichTextKind,
  setRichTextFormatRange,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const BG_R = 0x22;
const BG_G = 0x44;
const BG_B = 0x88;
const BG_COLOR = (BG_R << 16) | (BG_G << 8) | BG_B; // 0x224488, a distinct mid blue
const TEXT_COLOR = 0xffffffff;
const FIELD_X = 200;
const FIELD_Y = 180;
const FIELD_W = 400;
const FIELD_H = 240;
const FONT_SIZE = 40;

const TEXT = 'BG';

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [RichTextKind],
  expectedImageDescription:
    'An 800x600 opaque black field with one solid mid-blue rectangle, 400x240, spanning x 200-600 and ' +
    'y 180-420, filled corner to corner in a single flat tone. Short white bold text reading BG sits on ' +
    'top of it near the upper left of that rectangle, at about 40 px. The fill is the claim: it covers ' +
    'the whole box, not just a strip behind the glyphs, so a point far from the text — near x 550, y 390 ' +
    '— is blue rather than black. The blue is flat with no gradient and does not extend past the box ' +
    'edges; outside x 200-600, y 180-420 the field is pure black, and there is no outline drawn around ' +
    'the rectangle.',
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
field.data.background = true;
field.data.backgroundColor = BG_COLOR;
field.data.text = TEXT;

// White text so glyph ink is clearly distinct from the blue fill; a short word in the top-left leaves the
// lower-right interior glyph-free for sampling the fill.
setRichTextFormatRange(field, { color: TEXT_COLOR }, 0, TEXT.length);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // INSIDE the box, lower-right interior — below the short top-anchored text line, away from any glyph ink.
  const insideX = FIELD_X + FIELD_W - 40;
  const insideY = FIELD_Y + FIELD_H - 40;
  const inside = at(insideX, insideY);
  if (!isBackground(inside)) {
    throw new Error(
      `[text-background-box] interior sample at (${insideX},${insideY}) is ${hex(inside)}, expected the ` +
        `background fill ${hex(BG_COLOR)} — the field background box does not appear to be painted`,
    );
  }

  // OUTSIDE the box, well clear of the field — should be the black scene background.
  const outsideX = FIELD_X - 60;
  const outsideY = FIELD_Y - 60;
  const outside = at(outsideX, outsideY);
  if (!isBlack(outside)) {
    throw new Error(
      `[text-background-box] exterior sample at (${outsideX},${outsideY}) is ${hex(outside)}, expected the ` +
        'black scene background — the background fill is not bounded to the field box',
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Within a tolerance of 0x224488 on each channel.
function isBackground(rgb: number): boolean {
  return (
    Math.abs(channel(rgb, 16) - BG_R) < 40 &&
    Math.abs(channel(rgb, 8) - BG_G) < 40 &&
    Math.abs(channel(rgb, 0) - BG_B) < 40
  );
}
function isBlack(rgb: number): boolean {
  return channel(rgb, 16) < 40 && channel(rgb, 8) < 40 && channel(rgb, 0) < 40;
}
function hex(rgb: number): string {
  return '0x' + (rgb >>> 0).toString(16).padStart(6, '0');
}
