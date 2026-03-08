import type { Matrix3x2 } from '../../geometry';
import type { BlendMode, ColorTransform, Shader } from '../../materials';
import type { SpriteBase } from '../../scene/graph/sprite/SpriteBase';
import type { RenderNode } from './RenderNode';

export interface SpriteRenderNode extends RenderNode {
  alpha: number;
  blendMode: BlendMode;
  colorTransform: ColorTransform;
  isMaskFrameID: number;
  shader: Shader | null;
  readonly source: SpriteBase;
  transform: Matrix3x2;
  transformFrameID: number;
  useColorTransform: boolean;
}
