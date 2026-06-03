import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Entity } from './Entity';
import type { Matrix } from './Matrix';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { Shader } from './Shader';

export interface RenderNode extends Entity {
  owner: Renderable;
  source: Renderable;
  kind: symbol;
  transform2D: Matrix;
  resolver: object | null;
  next: RenderNode | null;

  alpha: number;
  appearanceFrameID: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  name: string | null;
  renderer: Renderer | null;
  rendererData: RendererData | null;
  rendererDataSource: Renderable | null;
  rendererMapID: number;
  shader: Shader | null;
  transformFrameID: number;
  useColorTransform: boolean;
  visible: boolean;
}
