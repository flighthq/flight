import type {
  DisplayObject,
  DisplayObjectClipHooks,
  DOMRenderState,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';

import { pushDOMClipContours } from './domClipContours';
import { pushDOMClipRectangle, setDOMClipHooks } from './domClipRectangle';
import type { DOMRenderStateInternal } from './internal';

// Masks RETIRED — a former mask is a path ClipRegion realized as a CSS clip-path. The DOM clip stack now
// holds rect entries (DOMStageRectangle) and contour entries (DOMClipContourEntry); applyDOMClipRectangles
// must emit a clip-path for either (RECONCILE — see domClipContours.ts). Unwind by truncating the stack.
export function enableDOMClipSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  setDOMClipHooks(state as DOMRenderStateInternal);
}

const domDisplayObjectClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const internal = state as DOMRenderStateInternal;
    internal.domClipStack.length = 0;
    state.currentClipDepth = 0;
  },
  popClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const internal = state as DOMRenderStateInternal;
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    if (internal.domClipStack.length > target) internal.domClipStack.length = target;
    state.currentClipDepth = internal.domClipStack.length;
  },
  pushClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const internal = state as DOMRenderStateInternal;
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushDOMClipRectangle(internal.domClipStack, clip.rect, data.transform2D);
    } else {
      pushDOMClipContours(internal.domClipStack, clip.contours, clip.winding, data.transform2D);
    }
    state.currentClipDepth++;
  },
};
