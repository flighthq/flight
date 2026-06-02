import type { DisplayObject } from './DisplayObject';
import type { RenderTreeNode2D } from './RenderTreeNode2D';

export interface DisplayObjectRenderTreeNode extends RenderTreeNode2D {
  isMaskFrameID: number;
  maskDepth: number;
  scrollRectangleDepth: number;
  readonly source: DisplayObject;
  updateChildren: boolean;
}
