import type { Matrix3x2 } from '../math';
import type { BlendMode } from '../stage';
import type Renderable from './Renderable';
import type RenderableData from './RenderableData';

export default interface RendererState {
  readonly backgroundColor: number;
  readonly backgroundColorRGBA: number[];
  readonly backgroundColorString: string;
  currentBlendMode: BlendMode | null;
  pixelRatio: number;
  renderTransform: Matrix3x2;
  roundPixels: boolean;
  renderableStack: Renderable[];
  renderData: WeakMap<Renderable, RenderableData>;
  renderQueue: RenderableData[];
  renderQueueLength: number;
}
