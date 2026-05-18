import type { BlendMode, ColorTransform, Shader } from '../materials';

export interface HasAppearance {
  alpha: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform | null;
  shader: Shader | null;
  visible: boolean;
}
