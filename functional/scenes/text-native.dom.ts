import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  NativeTextKind,
  addNodeChild,
  createDisplayObject,
  createDomRenderState,
  createNativeText,
  defaultDomNativeTextRenderer,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  renderDomBackground,
  renderDomScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On a pure white 800×600 field, three text blocks begin at x=60. Near y=56 is a bold 32 px dark ' +
    'sans-serif heading reading “NativeText — platform/DOM text”. Beginning near y=130, a 680×180 box ' +
    'contains a wrapped 20 px dark-grey serif paragraph about the platform text engine, layout and ' +
    'NativeText. Near y=340 is the 24 px italic dark-red phrase “italic, colored, right-aligned ' +
    'style”. The red run is red-dominant, never blue or faint; the heading and paragraph are visibly ' +
    'near-black. Exact glyph outlines and line breaks are host-font dependent and are not part of the ' +
    'claim. No text appears outside these three blocks and all remaining field area stays white.',
);

// NativeText is platform/DOM-backed, so this test runs on the DOM backend only — there is no canvas or
// webgl render.*.ts, which restricts discovery to DOM.
const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.appendChild(container);

export const state = createDomRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, NativeTextKind, defaultDomNativeTextRenderer);
export const scale = 1;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}

registerFunctionalTarget({ kind: 'dom', state, width, height, scale, render });

const root = createDisplayObject();

// autoSize 'left': the field box tracks the measured element size (bounds come from the renderer's
// measurement writeback, keeping scene2d DOM-free).
const heading = createNativeText({
  data: {
    autoSize: 'left',
    style: { bold: true, color: 0x1a1a1aff, font: 'sans-serif', size: 32 },
    text: 'NativeText — platform/DOM text',
  },
});
heading.x = 60;
heading.y = 56;
addNodeChild(root, heading);

// autoSize 'none': a fixed wrapping box at the user width/height.
const paragraph = createNativeText({
  data: {
    autoSize: 'none',
    height: 180,
    style: { color: 0x333333ff, font: 'serif', leading: 6, size: 20 },
    text:
      'The platform text engine owns layout, measurement, and rendering. On web that is a DOM ' +
      'element; on a native port it would be CoreText or DirectWrite. NativeText opts out of the ' +
      'Flight TextLayout spine entirely — it is a sibling of TextLabel and RichText, not an extension.',
    width: width - 120,
  },
});
paragraph.x = 60;
paragraph.y = 130;
addNodeChild(root, paragraph);

const styled = createNativeText({
  data: {
    autoSize: 'left',
    style: { align: 'right', color: 0xc0392bff, italic: true, size: 24 },
    text: 'italic, colored, right-aligned style',
  },
});
styled.x = 60;
styled.y = 340;
addNodeChild(root, styled);

render(root);

// Two whole-frame ink fractions, no coordinates: the counts are what the style colors CLAIM, so a color
// that survives as a plausible-looking wrong color still fails. Both blocks below collapse under either
// half of a producer/consumer encoding mismatch — the 24-bit reading of `0xc0392bff` keeps `0x392bff`
// (blue, not red-dominant), and the RGBA reading of a bare `0xc0392b` puts 0x2b in alpha (faint, not
// dark). Measured on a correct render: dark 0.0141, red 0.0062; the floors sit near half of each, which
// leaves room for anti-aliasing and font-metric drift while still catching a channel shift outright.
export function assertRender(frame: Readonly<Bitmap>): void {
  const { dark, red } = measureInkFractions(frame);
  if (dark < 0.006) {
    throw new Error(
      `[text-native/dom] near-black text covers only ${(dark * 100).toFixed(2)}% of the frame ` +
        `(expected >= 0.60%) — the heading and paragraph runs are not drawn in their authored color`,
    );
  }
  if (red < 0.0025) {
    throw new Error(
      `[text-native/dom] red-dominant ink covers only ${(red * 100).toFixed(2)}% of the frame ` +
        `(expected >= 0.25%) — the 0xc0392bff run is not drawn in a red the packed RGBA encoding implies`,
    );
  }
}

function measureInkFractions(frame: Readonly<Bitmap>): { dark: number; red: number } {
  let dark = 0;
  let red = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const r = (rgb >> 16) & 255;
      const g = (rgb >> 8) & 255;
      const b = rgb & 255;
      if (r < 100 && g < 100 && b < 100) dark += 1;
      if (r > g + 60 && r > b + 60) red += 1;
    }
  }
  const total = frame.width * frame.height;
  return { dark: dark / total, red: red / total };
}
