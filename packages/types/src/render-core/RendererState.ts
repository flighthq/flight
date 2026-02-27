import type { Matrix3x2 } from '../geom';
import type { BlendMode } from '../materials/BlendMode';
import type ColorTransform from '../materials/ColorTransform';
import type Shader from '../materials/ColorTransform';
import type Renderable from './Renderable';
import type RenderableData from './RenderableData';

export default interface RendererState {
  readonly backgroundColor: number;
  readonly backgroundColorRGBA: number[];
  readonly backgroundColorString: string;
  readonly currentFrameID: number;
  readonly currentQueue: RenderableData[];
  readonly currentQueueLength: number;
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
