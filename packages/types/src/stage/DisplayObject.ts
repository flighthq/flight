import type BitmapFilter from '../filters/BitmapFilter.js';
import type Matrix3x2 from '../math/Matrix3x2.js';
import type Rectangle from '../math/Rectangle.js';
import type BlendMode from './BlendMode.js';
import type { DisplayObjectState } from './DisplayObjectState.js';
import type Shader from './Shader.js';
import type Stage from './Stage.js';

export default interface DisplayObject {
  alpha: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheAsBitmapMatrix: Matrix3x2 | null;
  readonly children: DisplayObject[] | null;
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
  visible: boolean;
  x: number;
  y: number;

  [DisplayObjectState.SymbolKey]?: DisplayObjectState;
}
