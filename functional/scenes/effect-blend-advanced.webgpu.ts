import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Node2D, Bitmap, WgpuTextureRenderTarget } from '@flighthq/sdk';
import {
  addNodeChild,
  AdvancedBlendMode,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createBlendEffect,
  createDisplayObject,
  createShape,
  createWgpuAcquisition,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuTextureRenderTarget,
  createWgpuScreenRenderTarget,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  registerWgpuBlendEffect,
  registerWgpuBlendEffectBackdrop,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field split into four equal quadrants of flat black and white, each 0.5*W x 0.5*H = 400 x 300 px ' +
    'with their boundaries at x = 0.5*W = 400 and y = 0.5*H = 300, arranged diagonally: the top-left quadrant is ' +
    'BLACK, the top-right is WHITE, the bottom-left is WHITE, and the bottom-right is BLACK. The top-left is the ' +
    'discriminating one — a white foreground block covers the whole top half and a white backdrop block covers ' +
    'the whole left half, so white-over-white must come out BLACK there. A top-left quadrant that is white means ' +
    'the blend was skipped and the foreground simply passed through, which is the failure. The quadrant edges are ' +
    'hard straight lines meeting at the centre of the field, with no gradient or blend across them and no grey ' +
    'anywhere: every pixel is near-black or near-white.',
);
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0, 0, 0, 1], depth: 1.0 } as const;
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuBlendEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba8',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const BACKDROP_KEY = 'scene';
const backdropTarget: WgpuTextureRenderTarget = createWgpuTextureRenderTarget(
  state,
  screen.width,
  screen.height,
  state.format,
);
// Opaque black behind the backdrop layer: a per-pass clear now, not a value stored on the target.
const backdropClear = { color: [0, 0, 0, 1], depth: 1.0 } as const;

export function render(backdropRoot: Node2D, layerRoot: Node2D): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);

  if (prepareScene2DRender(state, backdropRoot)) {
    const backdropPass = beginWgpuRenderPass(state, backdropTarget, backdropClear);
    renderWgpuScene2D(backdropPass, backdropRoot);
    endWgpuRenderPass(backdropPass);
  }
  registerWgpuBlendEffectBackdrop(state, BACKDROP_KEY, backdropTarget);

  if (prepareScene2DRender(state, layerRoot)) {
    const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear);
    renderWgpuScene2D(scenePass, layerRoot);
    endWgpuRenderEffectPipeline(scenePass, pipeline, [
      createBlendEffect(AdvancedBlendMode.Difference, { backdropKey: BACKDROP_KEY }),
    ]);
  }
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

const logicalWidth = width / scale;
const logicalHeight = height / scale;

function fillRectangle(color: number, x: number, y: number, width: number, height: number): Node2D {
  const shape = createShape();
  appendShapeBeginFill(shape, color, 1);
  appendShapeRectangle(shape, 0, 0, width, height);
  appendShapeEndFill(shape);
  shape.x = x;
  shape.y = y;
  return shape;
}

const backdropRoot = createDisplayObject();
backdropRoot.scaleX = scale;
backdropRoot.scaleY = scale;
addNodeChild(backdropRoot, fillRectangle(0xffffffff, 0, 0, logicalWidth * 0.5, logicalHeight));

const layerRoot = createDisplayObject();
layerRoot.scaleX = scale;
layerRoot.scaleY = scale;
addNodeChild(layerRoot, fillRectangle(0xffffffff, 0, 0, logicalWidth, logicalHeight * 0.5));

render(backdropRoot, layerRoot);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const isNear = (rgb: number, red: number, green: number, blue: number, tolerance: number): boolean => {
    const redDelta = ((rgb >> 16) & 255) - red;
    const greenDelta = ((rgb >> 8) & 255) - green;
    const blueDelta = (rgb & 255) - blue;
    return Math.abs(redDelta) <= tolerance && Math.abs(greenDelta) <= tolerance && Math.abs(blueDelta) <= tolerance;
  };
  const hex = (rgb: number): string => (rgb & 0xffffffff).toString(16).padStart(6, '0');
  const topLeft = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * 0.25), Math.floor(bitmap.height * 0.25));
  const topRight = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * 0.75), Math.floor(bitmap.height * 0.25));
  const bottomLeft = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * 0.25), Math.floor(bitmap.height * 0.75));
  const bottomRight = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * 0.75), Math.floor(bitmap.height * 0.75));

  if (!isNear(topLeft, 0, 0, 0, 24)) {
    throw new Error(`[effect-blend-advanced] white overlap is #${hex(topLeft)}, expected Difference black`);
  }
  if (!isNear(topRight, 255, 255, 255, 24)) {
    throw new Error(`[effect-blend-advanced] layer-over-black is #${hex(topRight)}, expected white`);
  }
  if (!isNear(bottomLeft, 255, 255, 255, 24)) {
    throw new Error(`[effect-blend-advanced] backdrop-only is #${hex(bottomLeft)}, expected white`);
  }
  if (!isNear(bottomRight, 0, 0, 0, 24)) {
    throw new Error(`[effect-blend-advanced] empty region is #${hex(bottomRight)}, expected black`);
  }
}
