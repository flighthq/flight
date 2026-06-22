// Patches HTMLCanvasElement to return a mock WebGL2RenderingContext for
// getContext('webgl2') in jsdom. vitest-webgl-canvas-mock covers webgl and
// experimental-webgl but not webgl2; this fills that gap. Replace this file
// with a proper library if one emerges.

import { makeGl2Context } from './webglContextMock';

export { makeGl2Context };

const _getContext = HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
  if (contextId === 'webgl2') {
    return makeGl2Context();
  }
  return (_getContext as (...a: unknown[]) => unknown).call(this, contextId, ...args);
} as typeof HTMLCanvasElement.prototype.getContext;
