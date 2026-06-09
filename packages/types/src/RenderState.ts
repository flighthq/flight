import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { AppearanceHooks, DisplayObjectClipHooks, DisplayObjectMaskRenderer } from './DisplayObjectRenderer';
import type { Entity } from './Entity';
import type { Matrix } from './Matrix';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RenderFeatures } from './RenderFeatures';
import type { RenderNode } from './RenderNode';

export interface RenderState extends Entity {
  allowSmoothing: boolean;
  appearanceHooks: AppearanceHooks | null;
  readonly backgroundColor: number;
  readonly backgroundColorRGBA: number[];
  readonly backgroundColorString: string;
  readonly currentFrameID: number;
  currentMaskDepth: number;
  currentClipRectangleDepth: number;
  displayObjectClipHooks: DisplayObjectClipHooks | null;
  readonly displayObjectMaskRendererMap: Map<symbol, DisplayObjectMaskRenderer>;
  readonly displayObjectMaskRendererMapID: number;
  pixelRatio: number;
  readonly renderNodeMap: WeakMap<Renderable, RenderNode>;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderColorTransform: ColorTransform | null;
  renderFeatures: RenderFeatures;
  renderTransform2D: Matrix | null;
  readonly rendererMap: Map<symbol, Renderer>;
  readonly rendererMapID: number;
  roundPixels: boolean;
  readonly tempStack: Renderable[];
}
