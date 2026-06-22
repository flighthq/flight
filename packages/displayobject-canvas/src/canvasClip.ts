import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectClipHooks,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';

import { popCanvasClipRectangle, pushCanvasClipContours, pushCanvasClipRectangle } from './canvasClipRectangle';

// Masks RETIRED — a former mask is a path ClipRegion. Canvas realizes both clip forms with the native
// context clip (rect path or contour path), so push/pop is a uniform ctx.save()/ctx.restore() bracket
// and pop needs no per-form dispatch.
export function enableCanvasClipSupport(state: CanvasRenderState): void {
  state.displayObjectClipHooks = canvasClipHooks;
}

const canvasClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as CanvasRenderState;
    while (s.currentClipDepth > 0) {
      popCanvasClipRectangle(s);
      s.currentClipDepth--;
    }
  },
  popClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as CanvasRenderState;
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (s.currentClipDepth > target) {
      popCanvasClipRectangle(s);
      s.currentClipDepth--;
    }
  },
  pushClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as CanvasRenderState;
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushCanvasClipRectangle(s, clip.rect, data.transform2D);
    } else {
      pushCanvasClipContours(s, clip.contours, clip.winding, data.transform2D);
    }
    s.currentClipDepth++;
  },
};
