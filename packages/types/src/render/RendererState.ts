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
  renderableDataMap: WeakMap<Renderable, RenderableData>;
  renderableStack: Renderable[];
  renderQueue: RenderableData[];
  renderQueueLength: number;
  renderTransform: Matrix3x2;
  roundPixels: boolean;
}
