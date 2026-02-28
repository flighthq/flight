import type { BlendMode, ColorTransform, Matrix3x2, Shader } from '@flighthq/types';

import type Renderable from './Renderable';
import type RenderableData from './RenderableData';

export default interface RendererState {
  allowCacheAsBitmap: boolean;
  allowFilters: boolean;
  allowSmoothing: boolean;
  readonly backgroundColor: number;
  readonly backgroundColorRGBA: number[];
  readonly backgroundColorString: string;
  readonly currentFrameID: number;
  currentMaskDepth: number;
  readonly currentQueue: RenderableData[];
  readonly currentQueueLength: number;
  currentScrollRectDepth: number;
  pixelRatio: number;
  readonly renderableDataMap: WeakMap<Renderable, RenderableData>;
  renderAlpha: number;
  renderBlendMode: BlendMode | null;
  renderColorTransform: ColorTransform | null;
  renderShader: Shader | null;
  renderTransform: Matrix3x2 | null;
  roundPixels: boolean;
  readonly tempStack: Renderable[];
}
