import {
  webHostGl,
  appendWebSurface,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import type { Bitmap, GlEffectState, Node2D } from '@flighthq/sdk';
import {
  createGlSurface,
  defaultScene3DGlRenderRegistries,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlEffectState,
  createDisplayObject,
  createGlEffectState,
  createGlRenderState,
  createSepiaAdjustment,
  createShape,
  defaultGlShapeRenderer,
  endGlEffectState,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'The 800×600 field is exactly filled by a gapless 3×2 grid of six flat panels, each one third of ' +
    'the width and one half of the height. The six source colours retain different brightnesses but ' +
    'all become warm sepia browns and tans whose channels descend red to green to blue. Saturated ' +
    'green, blue, magenta and cyan are absent; no panel keeps a cool hue. There is no visible ' +
    'background, border, gradient, outline or spacing between panels.',
);

// Full-frame sepia color grade: applies a full sepia tone. One config applied to the whole scene through an
// rgba8 effect pipeline (the default format for color ops, so format is omitted).
const pixelRatio = window.devicePixelRatio || 1;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 800 * pixelRatio, 600 * pixelRatio, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, 800, 600);
appendWebSurface(glSurface, document.body);

export const state = createGlRenderState(glSurface.context, defaultScene3DGlRenderRegistries, {
  pixelRatio,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
const pipeline: GlEffectState = createGlEffectState(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const screenClear = { color: [0x20 / 0xff, 0x28 / 0xff, 0x30 / 0xff, 1], depth: 1.0 } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlEffectState(state, pipeline, 'srgb', screenClear);
  renderGlScene2D(pass, root);
  endGlEffectState(pass, pipeline, [createSepiaAdjustment({ intensity: 1 })]);
}

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// applies a full sepia tone.

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

// Sepia maps every color to a warm brown scale whose channel ordering is R >= G >= B. The sepia
// matrix's row coefficients are R-row > G-row > B-row in every column, so this ordering holds
// regardless of whether the operation runs in sRGB or linear space. Without the effect, cell 1
// (0x30c040ff, G=192 >> R=48) and cell 2 (0x3060ffff, B=255 >> R=48) violate R >= G >= B and fail.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const labels = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(((col + 0.5) * frame.width) / cols);
    const cy = Math.round(((row + 0.5) * frame.height) / rows);
    const rgb = getBitmapPixelRgb(frame, cx, cy);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;

    if (r < g - 3 || g < b - 3) {
      throw new Error(
        `[effect-sepia] ${labels[i]} cell has rgb(${r},${g},${b}) — expected warm-tone ordering R >= G >= B`,
      );
    }
  }
}
