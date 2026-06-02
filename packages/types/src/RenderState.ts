import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Entity } from './Entity';
import type { Matrix } from './Matrix';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RenderFeatures } from './RenderFeatures';
import type { RenderTreeNode } from './RenderTreeNode';
import type { BitmapShader } from './Shader';

export interface RenderState extends Entity {
  allowSmoothing: boolean;
  readonly backgroundColor: number;
  readonly backgroundColorRGBA: number[];
  readonly backgroundColorString: string;
  readonly currentFrameID: number;
  currentMaskDepth: number;
  readonly currentQueue: RenderTreeNode[];
  readonly currentQueueLength: number;
  currentScrollRectDepth: number;
  pixelRatio: number;
  readonly renderNodeMap: WeakMap<Renderable, RenderTreeNode>;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderColorTransform: ColorTransform | null;
  renderFeatures: RenderFeatures;
  renderShader: BitmapShader | null;
  renderTransform2D: Matrix | null;
  readonly rendererMap: Map<symbol, Renderer>;
  readonly rendererMapID: number;
  roundPixels: boolean;
  readonly tempStack: Renderable[];
}
