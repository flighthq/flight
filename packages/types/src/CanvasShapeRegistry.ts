import type { CanvasShapeDrawState } from './CanvasShapeDrawState';
import type { ShapeCommandKey, ShapeCommandRegistry } from './ShapeCommand';

export type CanvasShapeHandler<K extends ShapeCommandKey> = (
  ctx: CanvasRenderingContext2D,
  state: CanvasShapeDrawState,
  ...args: ShapeCommandRegistry[K]
) => void;

export type CanvasShapeCommandMap = {
  [K in ShapeCommandKey]?: CanvasShapeHandler<K>;
};
