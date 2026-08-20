import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginCanvasRenderEffectPipeline,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createDisplayObject,
  createPosterizeEffect,
  getBitmapPixelRgb,
  createShape,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  endCanvasRenderEffectPipeline,
  prepareScene2DRender,
  registerCanvasPosterizeEffect,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'The 800×600 field is exactly filled by a gapless 3×2 grid of six flat colour panels, each one third of the ' +
    'width and one half of the height. From left to right they remain recognisably red, green and blue on the top ' +
    'row, then yellow, magenta and cyan on the bottom, but every channel is snapped to one of four intensity ' +
    'steps: across the six panel centres there are no more than four distinct blue values, rather than the five ' +
    'values in the ungraded colours. There is no visible background, border, gradient, outline or spacing between ' +
    'panels. This cell renders the same quantisation its Gl and Wgpu siblings do — canvas realizes posterize ' +
    'through registerCanvasPosterizeEffect, applying floor(c*levels)/(levels - 1) per channel over the raw ' +
    'pixels, so it is no longer a backend control. The one place it is permitted to differ from those siblings is ' +
    'the two 1-pixel columns at x = W/3 = 266 and x = 2W/3 = 533, where the panel boundary falls on a fractional ' +
    'pixel: the backends resolve that column to slightly different source values and the step function snaps the ' +
    'difference to a whole level. Every panel INTERIOR matches exactly.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasPosterizeEffect(state);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [createPosterizeEffect({ levels: 4 })]);
}

// Distinct saturated-color shapes retain the shared scene intent while the missing backend capability
// stays visible as an unchanged image.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3030ff, 0x30c040ff, 0x3060ffff, 0xffd030ff, 0xff30c0ff, 0x30d0d0ff];
const cols = 3;
const rows = 2;
const cellWidth = logicalWidth / cols;
const cellHeight = logicalHeight / rows;
for (let i = 0; i < colors.length; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, 0, 0, cellWidth, cellHeight);
  appendShapeEndFill(shape);
  shape.x = col * cellWidth;
  shape.y = row * cellHeight;
  addNodeChild(root, shape);
}

render(root);

// Control column: canvas has no posterize runner, so the 6 input shapes render unquantized.
// The 6 RGBA colors yield 5 distinct blue channels (48, 64, 255, 192, 208). Exactly 5 confirms the
// shapes rendered with correct RGBA unpacking and no spurious quantization was applied.
// This cell is no longer a backend control: canvas now realizes posterize through
// registerCanvasPosterizeEffect, so it asserts the SAME quantisation its Gl and Wgpu siblings do.
// The previous assertion here required 5 distinct levels — the unquantised picture — and would
// now fail against a correct render, which is what a control assertion becomes once the backend
// grows the capability.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const blues = new Set<number>();

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(((col + 0.5) * frame.width) / cols);
    const cy = Math.round(((row + 0.5) * frame.height) / rows);
    const rgb = getBitmapPixelRgb(frame, cx, cy);
    const b = rgb & 0xff;
    let found = false;
    for (const existing of blues) {
      if (Math.abs(existing - b) < 8) {
        found = true;
        break;
      }
    }
    if (!found) blues.add(b);
  }

  if (blues.size > 4) {
    throw new Error(
      `[effect-posterize] expected <= 4 distinct blue levels after quantization, got ${blues.size} — ` +
        `values: ${[...blues].join(', ')}`,
    );
  }
}
