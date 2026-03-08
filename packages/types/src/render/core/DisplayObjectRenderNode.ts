import type { Matrix3x2 } from '../../geometry';
import type { BlendMode, ColorTransform, Shader } from '../../materials';
import type { DisplayObject } from '../../scene/graph/display/DisplayObject';
import type { RenderNode } from './RenderNode';

export interface DisplayObjectRenderNode extends RenderNode {
  alpha: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheBitmap: DisplayObjectRenderNode | null;
  colorTransform: ColorTransform;
  isMaskFrameID: number;
  maskDepth: number;
  scrollRectDepth: number;
  shader: Shader | null;
  readonly source: DisplayObject;
  transform: Matrix3x2;
  transformFrameID: number;
  useColorTransform: boolean;
}
