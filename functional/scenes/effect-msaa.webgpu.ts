import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  enableWgpuRenderEffectGuards,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'Four narrow colored bars (pink 0xff5c7c, green 0x5cff9c, blue 0x5c9cff, gold 0xffd25c) of 180×32 on dark background (0x101014), rotated 18°/42°/66°/90°. No post-process effects applied — empty effects array. Diagonal edges are smooth from the 2x-per-axis supersample-and-resolve the Wgpu effect target performs for sampleCount 4, matching the Gl cell.',
);

// Wgpu parity column for the MSAA reference scene. sampleCount 4 is HONOURED here: the effect target is
// allocated at 2x per axis and resolved down, so the same rotated shapes come out antialiased as they do
// on Gl. The two backends reach that by different means — Gl resolves a real multisample renderbuffer,
// Wgpu supersamples — and the point of the pair is that the PICTURE agrees, not the mechanism. Rendered
// through the pipeline with an empty effect list so nothing but the resolve is under test.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
enableWgpuRenderEffectGuards(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Rotated, slightly-skewed filled shapes whose long diagonal edges alias badly without MSAA. Rendered
// through the effect pipeline at sampleCount 4, the edges should come out smooth.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -90, -16, 180, 32);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.25 + 0.5 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.25 * Math.floor(i / 2));
  shape.rotation = 18 + i * 24;
  addNodeChild(root, shape);
}

render(root);

// ★ READ OFF THE SOURCE, NOT OFF THE PICTURE: this scene builds its effect pipeline with
// `sampleCount: 4` and draws four filled bars rotated off-axis on a flat field, with an empty effects
// array. A multisampled resolve is the only thing in that description that can put a pixel at PARTIAL
// coverage — a fraction of a bar's colour blended with the field — so counting partial-luminance pixels
// along the diagonal edges measures exactly the one property the scene exists to show.
//
// The window sits between the two luminances the scene actually contains: the field is 0x101014
// (luminance about 17) and the dimmest bar channel average is well above 90, so nothing but an edge
// pixel can land inside it.
const PARTIAL_LOW = 20;
const PARTIAL_HIGH = 90;

function countPartialCoveragePixels(frame: Readonly<Bitmap>): number {
  let partial = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const luminance = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (luminance > PARTIAL_LOW && luminance < PARTIAL_HIGH) partial++;
    }
  }
  return partial;
}

// ★ THIS CELL USED TO ASSERT THE ABSENCE OF ANTIALIASING, AND ITS TRIPWIRE FIRED AS DESIGNED. Wgpu
// silently downgraded any sampleCount above 1 to 1, so the scene that antialiased on Gl came out hard
// here — measured 0 partial pixels against 258 on Gl. The old assertion said, in as many words, that if
// multisampling ever landed it should go red and point at this file. It did: `7260ece8b` made the effect
// target honour sampleCount 4 and `433491851` fixed the projection that had it rendering into a quarter
// of that target, and this cell reported 424 partial pixels.
//
// So the cell now asserts the PRESENCE of the antialiasing, on the same threshold as its Gl sibling. The
// two backends reach it differently — Gl resolves a real multisample renderbuffer, Wgpu supersamples 2x
// per axis and resolves — and the point of the pair is that the PICTURE agrees, not the mechanism.
const MIN_ANTIALIASED_EDGE_PIXELS = 80;
const EXPECTED_BAR_RGB = [0xff5c7c, 0x5cff9c, 0x5c9cff, 0xffd25c] as const;

export function assertRender(frame: Readonly<Bitmap>): void {
  assertBarCenters(frame);

  const partial = countPartialCoveragePixels(frame);
  if (partial < MIN_ANTIALIASED_EDGE_PIXELS) {
    throw new Error(
      `[effect-msaa] ${partial} partial-coverage pixels (expected at least ${MIN_ANTIALIASED_EDGE_PIXELS}) — ` +
        `the edges are aliased, so the Wgpu effect target stopped honouring sampleCount 4`,
    );
  }
}

// The aggregate edge count above proves the resolve is antialiased, while these location-indexed centers
// prove those edges still belong to the four intended bars. Without this half, moving or permuting whole
// bars preserves the exact partial-pixel count and the assertion is blind to the corrupted picture.
// MEASURED defeat: swapping bars 0 and 1 failed both backends at (200, 180), #5cff9c vs #ff5c7c.
function assertBarCenters(frame: Readonly<Bitmap>): void {
  for (let i = 0; i < colors.length; i++) {
    const x = Math.round(frame.width * (0.25 + 0.5 * (i % 2)));
    const y = Math.round(frame.height * (0.3 + 0.25 * Math.floor(i / 2)));
    const actual = getBitmapPixelRgb(frame, x, y);
    const expected = EXPECTED_BAR_RGB[i]!;
    const delta = Math.max(
      Math.abs(((actual >> 16) & 255) - ((expected >> 16) & 255)),
      Math.abs(((actual >> 8) & 255) - ((expected >> 8) & 255)),
      Math.abs((actual & 255) - (expected & 255)),
    );
    if (delta > 4) {
      throw new Error(
        `[effect-msaa] bar ${i} center at (${x}, ${y}) is #${actual.toString(16).padStart(6, '0')} ` +
          `(expected #${expected.toString(16).padStart(6, '0')}) — the antialiased bars moved or changed`,
      );
    }
  }
}
