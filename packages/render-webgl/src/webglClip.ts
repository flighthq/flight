import type { DisplayObject, DisplayObjectClipHooks, RenderProxy2D, WebGLRenderState } from '@flighthq/types';

import { popWebGLClipContours, pushWebGLClipContours } from './webglClipContours';
import { popWebGLClipRectangle, pushWebGLClipRectangle } from './webglClipRectangle';
import { getWebGLRenderStateRuntime } from './webglRenderState';

// Clip support installs the unified clip hooks. Masks are RETIRED — a former mask is now a path
// ClipRegion (createClipRegionFromPath + setDisplayObjectClip), realized by the contour stencil below.
export function enableWebGLClipSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
}

// A clip is realized as a scissor (rect form) or stencil-then-cover (contour form). These are
// independent hardware gates that AND together when nested. `clipForms` records each pushed clip's
// form so the depth-driven unwind un-installs the right gate.
function popOneWebGLClip(state: WebGLRenderState): void {
  const form = getWebGLRenderStateRuntime(state).clipForms.pop();
  if (form === 'contour') popWebGLClipContours(state);
  else popWebGLClipRectangle(state);
}

const webglClipHooks: DisplayObjectClipHooks = {
  finalize(state: WebGLRenderState): void {
    const runtime = getWebGLRenderStateRuntime(state);
    while (runtime.clipForms.length > 0) popOneWebGLClip(state);
  },
  popClip(state: WebGLRenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getWebGLRenderStateRuntime(state);
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (runtime.clipForms.length > target) popOneWebGLClip(state);
  },
  pushClip(state: WebGLRenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getWebGLRenderStateRuntime(state);
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushWebGLClipRectangle(state, clip.rect, data.transform2D);
      runtime.clipForms.push('rect');
    } else {
      pushWebGLClipContours(state, clip.contours, clip.winding, data.transform2D);
      runtime.clipForms.push('contour');
    }
  },
};
