import type { BlendMode, ColorTransform, Matrix3x2, Rectangle, Shader } from '@flighthq/types';

import type Renderable from './Renderable';

export default interface RenderableData {
  alpha: number;
  appearanceFrameID: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheBitmap: RenderableData | null;
  colorTransform: ColorTransform;
  isMaskFrameID: number;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  maskDepth: number;
  scrollRectDepth: number;
  shader: Shader | null;
  readonly source: Renderable;
  transform: Matrix3x2;
  transformFrameID: number;
  useColorTransform: boolean;
  visible: boolean;
}
