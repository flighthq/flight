import type { BlendMode, ColorTransform, Matrix3x2, Rectangle, Shader } from '@flighthq/types';

import type Renderable from './Renderable';

export default interface RenderableData {
  alpha: number;
  appearanceFrameID: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  clipRect: Rectangle | null;
  colorTransform: ColorTransform;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  mask: RenderableData | null;
  maskFrameID: number;
  shader: Shader | null;
  readonly source: Renderable;
  transform: Matrix3x2;
  transformFrameID: number;
  useColorTransform: boolean;
  visible: boolean;
}
