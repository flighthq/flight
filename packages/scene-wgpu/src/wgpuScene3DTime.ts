import type { WgpuRenderState } from '@flighthq/types';

// Resolves the scene-scoped time uploaded by ShadedMaterial's animated modifiers. The default is zero,
// making an unset scene deterministic. Kept per state so independent canvases do not share animation.
export function getWgpuScene3DTime(state: Readonly<WgpuRenderState>): number {
  return sceneTimes.get(state) ?? 0;
}

// Sets the scene-scoped time in seconds used by ShadedMaterial modifiers for the next draw.
export function setWgpuScene3DTime(state: WgpuRenderState, seconds: number): void {
  sceneTimes.set(state, seconds);
}

const sceneTimes = new WeakMap<WgpuRenderState, number>();
