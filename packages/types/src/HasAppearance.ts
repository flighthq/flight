import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Shader } from './Shader';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform | null;
  shader: Shader | null;
  visible: boolean;
}
