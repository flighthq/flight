import type { Matrix3x2, Rectangle } from '../../../geometry';
import type { BlendMode, ColorTransform, Filter, Shader } from '../../../materials';
import type { GraphState, GraphStateKey } from './GraphState.js';
import type { Stage } from './Stage.js';

export interface DisplayObject {
  alpha: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheAsBitmapMatrix: Matrix3x2 | null;
  readonly children: DisplayObject[] | null;
  colorTransform: ColorTransform | null;
  data: DisplayObjectData | null;
  filters: Filter[] | null;
  kind: symbol;
  mask: DisplayObject | null;
  name: string | null;
  opaqueBackground: number | null;
  readonly parent: DisplayObject | null;
  rotation: number;
  scaleX: number;
  scaleY: number;
  scale9Grid: Rectangle | null;
  scrollRect: Rectangle | null;
  shader: Shader | null;
  readonly stage: Stage | null;
  visible: boolean;
  x: number;
  y: number;

  [GraphStateKey]: GraphState | undefined;
}

export type DisplayObjectData = object;

export const DisplayObjectKind: unique symbol = Symbol('DisplayObject');
