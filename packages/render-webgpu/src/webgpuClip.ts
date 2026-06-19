import type { DisplayObject, DisplayObjectClipHooks, RenderProxy2D, WebGPURenderState } from '@flighthq/types';

import { popWebGPUClipContours, pushWebGPUClipContours } from './webgpuClipContours';
import { popWebGPUClipRectangle, pushWebGPUClipRectangle } from './webgpuClipRectangle';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';

// Masks RETIRED — a former mask is a path ClipRegion. Clip = scissor (rect) or stencil-then-cover
// (contour); independent gates that AND when nested. `runtime.clipForms` records each clip's form for unwind.
export function enableWebGPUClipSupport(state: WebGPURenderState): void {
  state.displayObjectClipHooks = webgpuClipHooks;
}

function popOneWebGPUClip(state: WebGPURenderState): void {
  const runtime = getWebGPURenderStateRuntime(state);
  const form = runtime.clipForms.pop();
  if (form === 'contour') popWebGPUClipContours(state);
  else popWebGPUClipRectangle(state); // pops its own scissor stack; clipForms tracks the count
}

const webgpuClipHooks: DisplayObjectClipHooks = {
  finalize(state: WebGPURenderState): void {
    const runtime = getWebGPURenderStateRuntime(state);
    while (runtime.clipForms.length > 0) popOneWebGPUClip(state);
  },
  popClip(state: WebGPURenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getWebGPURenderStateRuntime(state);
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (runtime.clipForms.length > target) popOneWebGPUClip(state);
  },
  pushClip(state: WebGPURenderState, data: RenderProxy2D, source: DisplayObject): void {
    const runtime = getWebGPURenderStateRuntime(state);
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushWebGPUClipRectangle(state, clip.rect, data.transform2D);
      runtime.clipForms.push('rect');
    } else {
      pushWebGPUClipContours(state, clip.contours, clip.winding, data.transform2D);
      runtime.clipForms.push('contour');
    }
  },
};
