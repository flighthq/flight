import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { DisplayObject, DisplayObjectClipHooks, GlRenderState, RenderProxy2D } from '@flighthq/types';

import { popGlClipContours, pushGlClipContours } from './webglClipContours';
import { popGlClipRectangle, pushGlClipRectangle } from './webglClipRectangle';

// Clip support installs the unified clip hooks. Masks are RETIRED — a former mask is now a path
// ClipRegion (createClipRegionFromPath + setDisplayObjectClip), realized by the contour stencil below.
export function enableGlClipSupport(state: GlRenderState): void {
  state.displayObjectClipHooks = webglClipHooks;
}

// A clip is realized as a scissor (rect form) or stencil-then-cover (contour form). These are
// independent hardware gates that AND together when nested. `clipForms` records each pushed clip's
// form so the depth-driven unwind un-installs the right gate.
function popOneGlClip(state: GlRenderState): void {
  const form = getGlRenderStateRuntime(state).clipForms.pop();
  if (form === 'contour') popGlClipContours(state);
  else popGlClipRectangle(state);
}

const webglClipHooks: DisplayObjectClipHooks = {
  finalize(state: GlRenderState): void {
    const runtime = getGlRenderStateRuntime(state);
    while (runtime.clipForms.length > 0) popOneGlClip(state);
  },
  popClip(state: GlRenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getGlRenderStateRuntime(state);
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (runtime.clipForms.length > target) popOneGlClip(state);
  },
  pushClip(state: GlRenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getGlRenderStateRuntime(state);
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushGlClipRectangle(state, clip.rect, data.transform2D);
      runtime.clipForms.push('rect');
    } else {
      pushGlClipContours(state, clip.contours, clip.winding, data.transform2D);
      runtime.clipForms.push('contour');
    }
  },
};
