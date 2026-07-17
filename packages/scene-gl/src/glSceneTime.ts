import type { GlRenderState } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// The per-frame `time` uniform seam owned by the shading GL assembly. The bind-once-per-material
// model has no per-frame channel, so animated modifiers (a scrolling AnimatedNormalModifier) read a
// scene-scoped time value the app advances each frame. The ShadedMaterial renderer uploads it into
// each ShadedMaterial program's `u_time`; a program with no time-dependent modifier simply ignores
// the (harmless) uniform. Time is in seconds; only the fractional/relative progression matters for
// scrolling, so the app may pass elapsed seconds directly.

// Returns the current per-frame time (seconds) stored on this state's scene runtime. Defaults to 0
// until setGlSceneTime runs, so a caller that never advances time gets a static (unscrolled) result.
export function getGlSceneTime(state: GlRenderState): number {
  return getGlSceneRuntime(state).time;
}

// Sets the per-frame time (seconds) the ShadedMaterial renderer uploads to `u_time` each draw. Call
// once per frame before drawScene so every animated modifier this frame samples the same time.
export function setGlSceneTime(state: GlRenderState, timeSeconds: number): void {
  getGlSceneRuntime(state).time = timeSeconds;
}
