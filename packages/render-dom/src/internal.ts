import type { DOMRenderState, DOMStageRectangle, RenderProxy2D } from '@flighthq/types';

export interface DOMClipHooks {
  apply(state: DOMRenderState, data: RenderProxy2D): void;
}

export type DOMRenderStateInternal = Omit<DOMRenderState, 'element'> & {
  element: HTMLElement;
  // Set by each renderer via setDOMRendererElement; read by the render loop after each draw.
  domCurrentElement: HTMLElement | null;
  // WeakMap from render node to its current DOM element; survives frame boundaries.
  domElementMap: WeakMap<RenderProxy2D, HTMLElement>;
  // Ping-pong order lists: domOrderList holds the previous frame's order so the next
  // frame can detect structure changes; domNextOrderList is the scratch buffer built
  // during the current frame. They swap at the end of each render call.
  domOrderList: RenderProxy2D[];
  domOrderLength: number;
  domNextOrderList: RenderProxy2D[];
  // Clip hooks: set when enableDOMClipRectangleSupport or enableDOMMaskSupport is called.
  domClipHooks: DOMClipHooks | null;
  // Clip rectangle stack shared between scroll rect and mask clip effects.
  domClipStack: DOMStageRectangle[];
};
