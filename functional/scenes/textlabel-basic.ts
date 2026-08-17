// textlabel-basic — validates the TextLabel primitive (single-format text) renders glyphs across all
// four backends. TextLabel is distinct from RichText: it carries ONE TextFormat (no per-range runs) and
// feeds the shared text-layout spine as a single run. The shared functional harness registers RichText
// but, until now, not TextLabel — this test exercises the newly-registered TextLabelKind renderer on
// canvas/dom/webgl/webgpu.
//
// Text rasterization is font-dependent, so the oracle is a lenient coverage check: the label's box must
// contain a healthy number of amber "ink" pixels (glyphs drew), and a region outside the label stays
// background. A renderer that didn't draw the label, or a missing registration, leaves the box empty.
import type { Bitmap } from '@flighthq/sdk';
import { addNodeChild, createDisplayObject, createTextLabel, getBitmapPixelRgb, TextLabelKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const FIELD_X = 200;
const FIELD_Y = 240;
const FIELD_W = 420;
const FIELD_H = 120;
const INK = 0xffcc00ff; // amber

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [TextLabelKind],
  expectedImageDescription:
    'An 800x600 opaque black field with one short line of bold amber text reading FLIGHT at about 72 px, ' +
    'inside a 420x120 box at x 200-620, y 240-360. It is a single line that does not wrap, one flat ' +
    'amber against pure black, with no filled box behind it, no border rectangle and no underline or ' +
    'strike line. Everything outside that box is pure black — a blank canvas is the failure this exists ' +
    'to catch. Exact glyph outlines depend on the installed sans-serif face and are not part of the ' +
    'claim; the position, size and colour are.',
});

const root = createDisplayObject();

const label = createTextLabel();
label.data.text = 'FLIGHT';
label.data.textFormat = { color: INK, size: 72, bold: true };
label.data.width = FIELD_W;
label.data.height = FIELD_H;
label.x = FIELD_X;
label.y = FIELD_Y;
addNodeChild(root, label);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Count amber ink across a grid inside the label box — glyphs must have rendered.
  let ink = 0;
  for (let gx = 0; gx <= 40; gx++) {
    for (let gy = 0; gy <= 12; gy++) {
      const x = FIELD_X + (gx / 40) * FIELD_W;
      const y = FIELD_Y + (gy / 12) * FIELD_H;
      if (isAmber(at(x, y))) ink++;
    }
  }
  if (ink < 20) {
    throw new Error(`[textlabel-basic] too few amber ink pixels in the label box (${ink}) — TextLabel did not render`);
  }

  // A region well below the label is background.
  let strayInk = 0;
  for (let gx = 0; gx <= 20; gx++) {
    if (isAmber(at(FIELD_X + (gx / 20) * FIELD_W, FIELD_Y + FIELD_H + 120))) strayInk++;
  }
  if (strayInk > 2) {
    throw new Error(`[textlabel-basic] amber ink found outside the label box (${strayInk}) — unexpected`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isAmber(rgb: number): boolean {
  // ~0xffcc00 = (255, 204, 0): high red, mid-high green, low blue.
  return channel(rgb, 16) > 170 && channel(rgb, 8) > 110 && channel(rgb, 0) < 110;
}
