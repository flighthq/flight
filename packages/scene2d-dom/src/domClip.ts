import type { Node2D, Scene2DClipHooks, DomRenderState, RenderProxy2D, RenderState } from '@flighthq/types/contract';

import { pushDomClipContours } from './domClipContours';
import { pushDomClipRectangle, setDomClipHooks } from './domClipRectangle';
import { getDomRenderStateRuntime } from './domRenderState';

// Masks RETIRED — a former mask is a path ClipRegion realized as a CSS clip-path. The DOM clip stack now
// holds rect entries (DomScene2DRectangle) and contour entries (DomClipContourEntry); applyDomClipRectangles
// must emit a clip-path for either (see domClipContours.ts). Unwind by truncating the stack.
export function enableDomClipSupport(state: DomRenderState): void {
  state.displayObjectClipHooks = domScene2DClipHooks;
  setDomClipHooks(state);
}

const domScene2DClipHooks: Scene2DClipHooks = {
  finalize(state: RenderState): void {
    const runtime = getDomRenderStateRuntime(state as DomRenderState);
    runtime.domClipStack.length = 0;
    state.currentClipDepth = 0;
  },
  popClip(state: RenderState, data: RenderProxy2D, source: Node2D): void {
    const runtime = getDomRenderStateRuntime(state as DomRenderState);
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    if (runtime.domClipStack.length > target) runtime.domClipStack.length = target;
    state.currentClipDepth = runtime.domClipStack.length;
  },
  pushClip(state: RenderState, data: RenderProxy2D, source: Node2D): void {
    const clip = source.clip;
    if (clip === null) return;
    const runtime = getDomRenderStateRuntime(state as DomRenderState);
    if (clip.contours === null) {
      pushDomClipRectangle(runtime.domClipStack, clip.rect, data.transform2D);
    } else {
      pushDomClipContours(runtime.domClipStack, clip.contours, clip.winding, data.transform2D);
    }
    state.currentClipDepth++;
  },
};
