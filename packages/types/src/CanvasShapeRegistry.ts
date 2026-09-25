import type { CanvasShapeDrawState } from './CanvasShapeDrawState.ts';
import type { ShapeBoundsCommand } from './ShapeBounds.ts';
import type { ShapeCommandKey } from './ShapeCommand.ts';

// Handler for drawing a command. Reads args from the flat command buffer at position i.
export type CanvasShapeHandler = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  buf: unknown[],
  i: number,
) => void;

export interface CanvasShapeCommand<K extends ShapeCommandKey = ShapeCommandKey> extends ShapeBoundsCommand<K> {
  readonly draw: CanvasShapeHandler;
}
