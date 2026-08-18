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
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'The 800×600 field is exactly filled by a gapless 3×2 grid of six flat, ungraded colour panels, each one ' +
    'third of the width and one half of the height. From left to right the top row is red (about R255 G48 B48), ' +
    'green (R48 G192 B64) and blue (R48 G96 B255); the bottom row is yellow (R255 G208 B48), magenta (R255 G48 ' +
    'B192) and cyan (R48 G208 B208). All five authored blue-channel values remain distinct. There is no visible ' +
    'background, border, gradient, outline or spacing between panels. THE PANELS ARE UNPOSTERISED ON PURPOSE and ' +
    'this cell is the canvas CONTROL: the posterize effect is not registered on this backend, so the pipeline ' +
    'treats it as an identity pass and copies the scene through unchanged. A picture with quantised or banded ' +
    'panels here would mean an unregistered effect had run. The realized posterisation belongs to the webgl and ' +
    'wgpu siblings.',
);

// Canvas has no realized posterize capability. The unregistered operation is intentionally skipped so
// this column records the backend's unsupported result without a fake passthrough runner.
export const functionalBackendSupport = 'control' as const;

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);

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

  if (blues.size !== 5) {
    throw new Error(
      `[effect-posterize] control column expects 5 distinct blue levels (no quantization), got ${blues.size} — ` +
        `values: ${[...blues].join(', ')}`,
    );
  }
}
