import type { Matrix } from './Matrix';
import type { RenderPrimitive } from './RenderPrimitive';
import type { WebGLRenderTarget } from './WebGLRenderTarget';

export const WebGLCacheKind: unique symbol = Symbol('WebGLCache');
export type WebGLCacheKind = typeof WebGLCacheKind;

export interface WebGLCache extends RenderPrimitive {
  kind: WebGLCacheKind;
  target: WebGLRenderTarget | null;
  transform: Matrix;
}
