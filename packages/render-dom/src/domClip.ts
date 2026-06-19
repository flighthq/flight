import type {
  DisplayObject,
  DisplayObjectClipHooks,
  DOMRenderState,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';

import { pushDOMClipContours } from './domClipContours';
import { pushDOMClipRectangle, setDOMClipHooks } from './domClipRectangle';
import { getDOMRenderStateRuntime } from './domRenderState';

// Masks RETIRED — a former mask is a path ClipRegion realized as a CSS clip-path. The DOM clip stack now
// holds rect entries (DOMStageRectangle) and contour entries (DOMClipContourEntry); applyDOMClipRectangles
// must emit a clip-path for either (see domClipContours.ts). Unwind by truncating the stack.
export function enableDOMClipSupport(state: DOMRenderState): void {
  state.displayObjectClipHooks = domDisplayObjectClipHooks;
  setDOMClipHooks(state);
}

const domDisplayObjectClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const runtime = getDOMRenderStateRuntime(state as DOMRenderState);
    runtime.domClipStack.length = 0;
    state.currentClipDepth = 0;
  },
  popClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getDOMRenderStateRuntime(state as DOMRenderState);
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    if (runtime.domClipStack.length > target) runtime.domClipStack.length = target;
    state.currentClipDepth = runtime.domClipStack.length;
  },
  pushClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const clip = source.clip;
    if (clip === null) return;
    const runtime = getDOMRenderStateRuntime(state as DOMRenderState);
    if (clip.contours === null) {
      pushDOMClipRectangle(runtime.domClipStack, clip.rect, data.transform2D);
    } else {
      pushDOMClipContours(runtime.domClipStack, clip.contours, clip.winding, data.transform2D);
    }
    state.currentClipDepth++;
  },
};
