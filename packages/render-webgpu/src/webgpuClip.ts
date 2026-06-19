import type {
  DisplayObject,
  DisplayObjectClipHooks,
  RenderProxy2D,
  RenderState,
  WebGPURenderState,
} from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { popWebGPUClipContours, pushWebGPUClipContours } from './webgpuClipContours';
import { popWebGPUClipRectangle, pushWebGPUClipRectangle } from './webgpuClipRectangle';

// Masks RETIRED — a former mask is a path ClipRegion. Clip = scissor (rect) or stencil-then-cover
// (contour); independent gates that AND when nested. `s.clipForms` records each clip's form for unwind.
export function enableWebGPUClipSupport(state: WebGPURenderState): void {
  state.displayObjectClipHooks = webgpuClipHooks;
}

function popOneWebGPUClip(s: WebGPURenderStateInternal): void {
  const form = s.clipForms.pop();
  if (form === 'contour') popWebGPUClipContours(s);
  else popWebGPUClipRectangle(s); // pops its own scissor stack; clipForms tracks the count
}

const webgpuClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as WebGPURenderStateInternal;
    while (s.clipForms.length > 0) popOneWebGPUClip(s);
  },
  popClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as WebGPURenderStateInternal;
    const target = data.clipDepth - (source.clip != null ? 1 : 0);
    while (s.clipForms.length > target) popOneWebGPUClip(s);
  },
  pushClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as WebGPURenderStateInternal;
    const clip = source.clip;
    if (clip === null) return;
    if (clip.contours === null) {
      pushWebGPUClipRectangle(s, clip.rect, data.transform2D);
      s.clipForms.push('rect');
    } else {
      pushWebGPUClipContours(s, clip.contours, clip.winding, data.transform2D);
      s.clipForms.push('contour');
    }
  },
};
