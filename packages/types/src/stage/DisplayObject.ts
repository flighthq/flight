import type Matrix3x2 from '../geom/Matrix3x2.js';
import type Rectangle from '../geom/Rectangle.js';
import type BlendMode from '../materials/BlendMode.js';
import type ColorTransform from '../materials/ColorTransform.js';
import type BitmapFilter from '../materials/Filter.js';
import type Shader from '../materials/Shader.js';
import type { DisplayObjectType } from './DisplayObjectType.js';
import type { GraphState } from './GraphState.js';
import type { PrimitiveData } from './PrimitiveData.js';
import type Stage from './Stage.js';

export default interface DisplayObject {
  alpha: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheAsBitmapMatrix: Matrix3x2 | null;
  readonly children: DisplayObject[] | null;
  colorTransform: ColorTransform | null;
  data: PrimitiveData | null;
  filters: BitmapFilter[] | null;
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
  type: DisplayObjectType;
  visible: boolean;
  x: number;
  y: number;

  [GraphState.SymbolKey]: GraphState | undefined;
}
