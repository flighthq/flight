import type { DOMRenderState, RenderTreeNode2D } from '@flighthq/types';

export type DOMRenderStateInternal = Omit<DOMRenderState, 'element'> & {
  element: HTMLElement;
  // Set by each renderer via setDOMRendererElement; read by the render loop after each draw.
  domCurrentElement: HTMLElement | null;
  // WeakMap from render node to its current DOM element; survives frame boundaries.
  domElementMap: WeakMap<RenderTreeNode2D, HTMLElement>;
  // Ping-pong order lists: domOrderList holds the previous frame's order so the next
  // frame can detect structure changes; domNextOrderList is the scratch buffer built
  // during the current frame. They swap at the end of each render call.
  domOrderList: RenderTreeNode2D[];
  domOrderLength: number;
  domNextOrderList: RenderTreeNode2D[];
};
