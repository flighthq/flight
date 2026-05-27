import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { BitmapShader } from './Shader';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform | null;
  shader: BitmapShader | null;
  visible: boolean;
}
