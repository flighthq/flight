import type { DisplayObject } from './DisplayObject';
import type { RenderNode2D } from './RenderNode2D';

export interface DisplayObjectRenderNode extends RenderNode2D {
  isMaskFrameID: number;
  maskDepth: number;
  scrollRectangleDepth: number;
  readonly source: DisplayObject;
  updateChildren: boolean;
}
