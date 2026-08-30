import {
  createEmptyGlRegistries,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderState,
} from '@flighthq/render-gl/contract';
import type { GlContext, GlRenderState } from '@flighthq/types/contract';

// Local test helper for scene2d-gl unit tests. Mirrors render-gl's own private
// glTestHelper pattern but builds the state through render-gl's PUBLIC createGlRenderState
// rather than reaching into render-gl internals. The jsdom webgl2Mock setup file patches
// HTMLCanvasElement.getContext('webgl2') to return a mock GlContext, so
// createGlRenderState produces a fully-populated state with a working mock GL.
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
  const contextState = createGlContextState(gl);
  const state = createGlRenderState(contextState, createGlPipeline(createEmptyGlRegistries()), {
    backgroundColor: 0x00000000,
    imageSmoothingEnabled: options?.allowSmoothing ?? true,
    pixelRatio: options?.pixelRatio,
  });
  return { state, gl: state.gl, canvas };
}
