import { createGlRenderState } from '@flighthq/render-gl';
import type { GlRenderState } from '@flighthq/types';

// Local test helper for displayobject-gl unit tests. Mirrors render-gl's own private
// glTestHelper pattern but builds the state through render-gl's PUBLIC createGlRenderState
// rather than reaching into render-gl internals. The jsdom webgl2Mock setup file patches
// HTMLCanvasElement.getContext('webgl2') to return a mock WebGL2RenderingContext, so
// createGlRenderState produces a fully-populated state with a working mock GL.
export function makeGlState(options?: { allowSmoothing?: boolean }): {
  state: GlRenderState;
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const state = createGlRenderState(canvas, {
    backgroundColor: 0x00000000,
    imageSmoothingEnabled: options?.allowSmoothing ?? true,
  });
  return { state, gl: state.gl, canvas };
}
