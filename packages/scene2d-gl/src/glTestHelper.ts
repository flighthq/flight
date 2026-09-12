import {
  createEmptyGlRegistries,
  createGlContextFromCanvasElement,
  createGlPipeline,
  createGlRenderState,
} from '@flighthq/render-gl/contract';
import type { GlContext, GlRenderState } from '@flighthq/types/contract';

export function createGlState(options?: { allowSmoothing?: boolean; pixelRatio?: number }): {
  state: GlRenderState;
  gl: GlContext;
  canvas: HTMLCanvasElement;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const gl = createGlContextFromCanvasElement(canvas);
  Object.defineProperties(gl, {
    drawingBufferHeight: { configurable: true, value: canvas.height },
    drawingBufferWidth: { configurable: true, value: canvas.width },
  });
  const state = createGlRenderState(gl, createGlPipeline(createEmptyGlRegistries()), {
    backgroundColor: 0x00000000,
    imageSmoothingEnabled: options?.allowSmoothing ?? true,
    pixelRatio: options?.pixelRatio,
  });
  return { state, gl: state.gl, canvas };
}
