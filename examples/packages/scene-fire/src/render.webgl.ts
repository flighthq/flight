import { createWebGlContext } from '@flighthq/host-web/contract';
import type { Camera3D, GlRenderEffectPipeline, Node3D, RenderEffect, Scene3DLightsLike } from '@flighthq/sdk';
import {
  scene3DGlPipeline,
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  enableFlightDiagnostics,
  endGlRenderEffectPipeline,
  prepareScene3DRender,
  registerGlBloomEffect,
  registerGlToneMapEffect,
  registerGlVignetteEffect,
} from '@flighthq/sdk';
import { drawGlScene3D } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
export const canvas = createGlCanvasElement(width, height, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createWebGlContext(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  scene3DGlPipeline,
  {
    pixelRatio,
  },
);
enableFlightDiagnostics(state);
registerGlBloomEffect(state);
registerGlToneMapEffect(state);
registerGlVignetteEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x09 / 0xff, 0x07 / 0xff, 0x0a / 0xff, 1], depth: 1.0 } as const;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  effects: readonly RenderEffect[],
): void {
  const pass = beginGlRenderEffectPipeline(state, pipeline, 'linear', screenClear);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(pass, scene, camera, lights);
  endGlRenderEffectPipeline(pass, pipeline, effects);
}
