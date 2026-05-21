import type { CanvasShapeDrawState } from './CanvasShapeDrawState';
import type { ShapeCommandKey } from './ShapeCommand';

// Handler for drawing a command. Reads args from the flat command buffer at position i.
export type CanvasShapeHandler = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  buf: unknown[],
  i: number,
) => void;

export interface CanvasShapeCommand<K extends ShapeCommandKey = ShapeCommandKey> {
  readonly key: K;
  readonly draw: CanvasShapeHandler;
}
