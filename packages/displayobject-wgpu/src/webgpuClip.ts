import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { DisplayObject, DisplayObjectClipHooks, RenderProxy2D, WgpuRenderState } from '@flighthq/types';

import { popWgpuClipContours, pushWgpuClipContours } from './webgpuClipContours';
import { popWgpuClipRectangle, pushWgpuClipRectangle } from './webgpuClipRectangle';

// Masks RETIRED — a former mask is a path ClipRegion. Clip = scissor (rect) or stencil-then-cover
// (contour); independent gates that AND when nested. `runtime.clipForms` records each clip's form for unwind.
export function enableWgpuClipSupport(state: WgpuRenderState): void {
  state.displayObjectClipHooks = webgpuClipHooks;
}

function popOneWgpuClip(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const form = runtime.clipForms.pop();
  if (form === 'contour') popWgpuClipContours(state);
  else popWgpuClipRectangle(state); // pops its own scissor stack; clipForms tracks the count
}

const webgpuClipHooks: DisplayObjectClipHooks = {
  finalize(state: WgpuRenderState): void {
    const runtime = getWgpuRenderStateRuntime(state);
    while (runtime.clipForms.length > 0) popOneWgpuClip(state);
  },
  popClip(state: WgpuRenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getWgpuRenderStateRuntime(state);
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (runtime.clipForms.length > target) popOneWgpuClip(state);
  },
  pushClip(state: WgpuRenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getWgpuRenderStateRuntime(state);
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushWgpuClipRectangle(state, clip.rect, data.transform2D);
      runtime.clipForms.push('rect');
    } else {
      pushWgpuClipContours(state, clip.contours, clip.winding, data.transform2D);
      runtime.clipForms.push('contour');
    }
  },
};
