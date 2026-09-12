import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Node2D, Bitmap, WgpuTextureRenderTarget } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  CompositeOperator,
  createCompositeEffect,
  createDisplayObject,
  createShape,
  createWgpuAcquisitionFromCanvasElement,
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
  registerWgpuBlendEffectBackdrop,
  registerWgpuCompositeEffect,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 opaque black field with a single white rectangle occupying the TOP-LEFT quadrant — ' +
    'x 0-400, y 0-300 — and nothing else drawn anywhere. The rest of the field is pure black. The ' +
    'picture is the intersection of two white blocks: one covering the left half and one covering the ' +
    'top half, kept only where they overlap. The two regions where just ONE of them lay must be black: ' +
    'the top-right quadrant around x 600, y 150 is black even though a white block covered it, and so ' +
    'is the bottom-left. A picture showing an L-shape, or the full top half or left half in white, ' +
    'means the intersection was not taken. The white area has hard straight edges meeting at (400,300) ' +
    'with no gradient or grey fringe.',
);
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisitionFromCanvasElement(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0, 0, 0, 1], depth: 1.0 } as const;
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuCompositeEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1, format: 'rgba8' });
const backdropTarget: WgpuTextureRenderTarget = createWgpuTextureRenderTarget(
  state,
  screen.width,
  screen.height,
  state.format,
);
// Transparent black behind the backdrop layer: a per-pass clear now, not a value stored on the target.
const backdropClear = { color: [0, 0, 0, 0], depth: 1.0 } as const;

export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, screen, scale);

function fillRectangle(x: number, y: number, width: number, height: number): Node2D {
  const shape = createShape();
  appendShapeBeginFill(shape, 0xffffffff, 1);
  appendShapeRectangle(shape, 0, 0, width, height);
  appendShapeEndFill(shape);
  shape.x = x;
  shape.y = y;
  return shape;
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;
const backdropRoot = createDisplayObject();
backdropRoot.scaleX = scale;
backdropRoot.scaleY = scale;
addNodeChild(backdropRoot, fillRectangle(0, 0, logicalWidth * 0.5, logicalHeight));

const layerRoot = createDisplayObject();
layerRoot.scaleX = scale;
layerRoot.scaleY = scale;
addNodeChild(layerRoot, fillRectangle(0, 0, logicalWidth, logicalHeight * 0.5));

const pass = beginWgpuRenderPass(state, screen, screenClear);
if (prepareScene2DRender(state, backdropRoot)) {
  const backdropPass = beginWgpuRenderPass(state, backdropTarget, backdropClear);
  renderWgpuScene2D(backdropPass, backdropRoot);
  endWgpuRenderPass(backdropPass);
}
registerWgpuBlendEffectBackdrop(state, 'scene', backdropTarget);

if (prepareScene2DRender(state, layerRoot)) {
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear);
  renderWgpuScene2D(scenePass, layerRoot);
  endWgpuRenderEffectPipeline(scenePass, pipeline, [
    createCompositeEffect(CompositeOperator.SourceIn, { backdropKey: 'scene' }),
  ]);
}
endWgpuRenderPass(pass);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const near = (rgb: number, expected: number): boolean => {
    const red = (rgb >> 16) & 255;
    const green = (rgb >> 8) & 255;
    const blue = rgb & 255;
    return Math.abs(red - expected) <= 24 && Math.abs(green - expected) <= 24 && Math.abs(blue - expected) <= 24;
  };
  const sample = (x: number, y: number): number =>
    getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * x), Math.floor(bitmap.height * y));
  const overlap = sample(0.25, 0.25);
  const sourceOnly = sample(0.75, 0.25);
  const backdropOnly = sample(0.25, 0.75);
  const hex = (rgb: number): string => (rgb & 0xffffffff).toString(16).padStart(6, '0');

  if (!near(overlap, 255)) {
    throw new Error(`[effect-composite] overlap is #${hex(overlap)}, expected SourceIn to retain the source`);
  }
  if (!near(sourceOnly, 0)) {
    throw new Error(`[effect-composite] source-only region is #${hex(sourceOnly)}, expected SourceIn to mask it out`);
  }
  if (!near(backdropOnly, 0)) {
    throw new Error(
      `[effect-composite] backdrop-only region is #${hex(backdropOnly)}, expected SourceIn to omit the backdrop`,
    );
  }
}
