import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { Node2D, Scene2DClipHooks, GlRenderState, RenderProxy2D } from '@flighthq/types/contract';

import { popGlClipContours, pushGlClipContours } from './glClipContours';
import { popGlClipRectangle, pushGlClipRectangle } from './glClipRectangle';

// Clip support installs the unified clip hooks. Masks are RETIRED — a former mask is now a path
// ClipRegion (createClipRegionFromPath + setNode2DClip), realized by the contour stencil below.
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

const webglClipHooks: Scene2DClipHooks = {
  finalize(state: GlRenderState): void {
    const runtime = getGlRenderStateRuntime(state);
    while (runtime.clipForms.length > 0) popOneGlClip(state);
  },
  popClip(state: GlRenderState, data: RenderProxy2D, source: Node2D): void {
    const runtime = getGlRenderStateRuntime(state);
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (runtime.clipForms.length > target) popOneGlClip(state);
  },
  pushClip(state: GlRenderState, data: RenderProxy2D, source: Node2D): void {
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
