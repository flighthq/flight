import type { Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createBloomEffect,
  createColorGradeAdjustment,
  createDisplayObject,
  createShape,
  createVignetteEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuBloomEffect,
  defaultWgpuShapeRenderer,
  registerWgpuVignetteEffect,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four turned tiles of about 140 px — white near ' +
    '(224,180), warm yellow near (576,180), cyan near (224,420), pink near (576,420) — carrying THREE ' +
    'stacked treatments at once, and all three must be visible together. Each tile glows softly outward ' +
    'past its edges into the dark background. The colours are more saturated and higher in contrast ' +
    'than their raw fills. And the frame is DARKENED TOWARD ITS CORNERS: the four corners are noticeably ' +
    'darker than the centre. Any one of the three missing is a failure — crisp tile edges, colour no ' +
    'more saturated than the raw fills, or uniform brightness corner-to-centre each mean one stage of ' +
    'the chain did not run. The ' +
    'tiles keep their positions and their hues throughout.',
);
// Wgpu parity column for the same three-scene2d chain as render.webgl.ts: bloom, then color grade,
// then vignette. The pipeline ping-pongs between offscreen targets so each registered runner reads
// the previous scene2d's output. HDR rgba16f keeps the bright pass intact for bloom.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuBloomEffect(state);
registerWgpuVignetteEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeAdjustment({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Bright, saturated shapes on a near-black field feed a three-scene2d effect chain: their high
// luminance crosses the bloom threshold for a glowing halo, the color grade pushes saturation and
// contrast, and the vignette darkens the corners.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);
