import type { DisplayObject } from '../../scene';
import type { RenderNode2D } from './RenderNode2D';

export interface DisplayObjectRenderNode extends RenderNode2D {
  cacheAsBitmap: boolean;
  cacheBitmap: DisplayObjectRenderNode | null;
  isMaskFrameID: number;
  maskDepth: number;
  scrollRectDepth: number;
  readonly source: DisplayObject;
}
