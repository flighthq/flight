import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Entity } from './Entity';
import type { Matrix } from './Matrix';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RenderNode } from './RenderNode';
import type { BitmapShader } from './Shader';

export interface RenderState extends Entity {
  allowFilters: boolean;
  allowSmoothing: boolean;
  readonly backgroundColor: number;
  readonly backgroundColorRGBA: number[];
  readonly backgroundColorString: string;
  readonly currentFrameID: number;
  currentMaskDepth: number;
  readonly currentQueue: RenderNode[];
  readonly currentQueueLength: number;
  currentScrollRectDepth: number;
  pixelRatio: number;
  readonly renderNodeMap: WeakMap<Renderable, RenderNode>;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderColorTransform: ColorTransform | null;
  renderShader: BitmapShader | null;
  renderTransform2D: Matrix | null;
  readonly rendererMap: Map<symbol, Renderer>;
  readonly rendererMapID: number;
  roundPixels: boolean;
  readonly tempStack: Renderable[];
}
