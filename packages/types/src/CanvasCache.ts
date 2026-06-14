import type { CanvasRenderTarget } from './CanvasRenderTarget';
import type { Matrix } from './Matrix';
import type { RenderPrimitive } from './RenderPrimitive';

export const CanvasCacheKind: unique symbol = Symbol('CanvasCache');
export type CanvasCacheKind = typeof CanvasCacheKind;

export interface CanvasCache extends RenderPrimitive {
  kind: CanvasCacheKind;
  target: CanvasRenderTarget | null;
  transform: Matrix;
}
