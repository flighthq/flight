import type { RenderNode2D } from './RenderNode2D';

export interface DisplayObjectRenderNode extends RenderNode2D {
  isMaskFrameID: number;
  maskDepth: number;
  scrollRectangleDepth: number;
  updateChildren: boolean;
}
