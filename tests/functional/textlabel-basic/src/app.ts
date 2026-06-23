// textlabel-basic — validates the TextLabel primitive (single-format text) renders glyphs across all
// four backends. TextLabel is distinct from RichText: it carries ONE TextFormat (no per-range runs) and
// feeds the shared text-layout spine as a single run. The shared functional harness registers RichText
// but, until now, not TextLabel — this test exercises the newly-registered TextLabelKind renderer on
// canvas/dom/webgl/webgpu.
//
// Text rasterization is font-dependent, so the oracle is a lenient coverage check: the label's box must
// contain a healthy number of amber "ink" pixels (glyphs drew), and a region outside the label stays
// background. A renderer that didn't draw the label, or a missing registration, leaves the box empty.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayContainer,
  createTextLabel,
  getSurfacePixelRgb,
  TextLabelKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const FIELD_X = 200;
const FIELD_Y = 240;
const FIELD_W = 420;
const FIELD_H = 120;
const INK = 0xffcc00; // amber

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [TextLabelKind],
});

const root = createDisplayContainer();

const label = createTextLabel();
label.data.text = 'FLIGHT';
label.data.textFormat = { color: INK, size: 72, bold: true };
label.data.width = FIELD_W;
label.data.height = FIELD_H;
label.x = FIELD_X;
label.y = FIELD_Y;
addNodeChild(root, label);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Count amber ink across a grid inside the label box — glyphs must have rendered.
  let ink = 0;
  for (let gx = 0; gx <= 20; gx++) {
    for (let gy = 0; gy <= 8; gy++) {
      const x = FIELD_X + (gx / 20) * FIELD_W;
      const y = FIELD_Y + (gy / 8) * FIELD_H;
      if (isAmber(at(x, y))) ink++;
    }
  }
  if (ink < 12) {
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
