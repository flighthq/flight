import type {
  DisplayObject,
  DisplayObjectClipHooks,
  RenderProxy2D,
  RenderState,
  WebGLRenderState,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { popWebGLClipContours, pushWebGLClipContours } from './webglClipContours';
import { popWebGLClipRectangle, pushWebGLClipRectangle } from './webglClipRectangle';

// Clip support installs the unified clip hooks. Masks are RETIRED — a former mask is now a path
// ClipRegion (createClipRegionFromPath + setDisplayObjectClip), realized by the contour stencil below.
export function enableWebGLClipSupport(state: WebGLRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
}

// A clip is realized as a scissor (rect form) or stencil-then-cover (contour form). These are
// independent hardware gates that AND together when nested. `s.clipForms` records each pushed clip's
// form so the depth-driven unwind un-installs the right gate.
function popOneWebGLClip(s: WebGLRenderStateInternal): void {
  const form = s.clipForms.pop();
  if (form === 'contour') popWebGLClipContours(s);
  else popWebGLClipRectangle(s);
}

const webglClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as WebGLRenderStateInternal;
    while (s.clipForms.length > 0) popOneWebGLClip(s);
  },
  popClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as WebGLRenderStateInternal;
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (s.clipForms.length > target) popOneWebGLClip(s);
  },
  pushClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as WebGLRenderStateInternal;
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushWebGLClipRectangle(s, clip.rect, data.transform2D);
      s.clipForms.push('rect');
    } else {
      pushWebGLClipContours(s, clip.contours, clip.winding, data.transform2D);
      s.clipForms.push('contour');
    }
  },
};
