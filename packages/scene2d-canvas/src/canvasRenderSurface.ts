import type { CanvasRenderState, CanvasSurface, HostCanvasCapability } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState.ts';

export function acquireCanvasSurface(
  canvasHost: Readonly<HostCanvasCapability>,
  width: number,
  height: number,
): CanvasSurface | null {
  const surface = canvasHost.createSurface(width, height);
  if (surface !== null) _ownedSurfaces.set(surface, canvasHost);
  return surface;
}

export function destroyCanvasSurfaceOwned(surface: CanvasSurface): void {
  const canvasHost = _ownedSurfaces.get(surface);
  if (canvasHost === undefined) return;
  _ownedSurfaces.delete(surface);
  canvasHost.destroySurface(surface);
}

// The host canvas capability this state allocates offscreen surfaces through: render-cache targets and
// render textures both ask for one, and neither can invent it — a canvas comes from the host. Registered
// once, read by name, and absent until then so a screen-only state carries nothing.
export function getCanvasHost(state: CanvasRenderState): Readonly<HostCanvasCapability> {
  const canvasHost = getCanvasRenderStateRuntime(state).canvasHost;
  if (canvasHost === undefined) {
    throw new Error('This CanvasRenderState has no canvas host — call registerCanvasHost first');
  }
  return canvasHost;
}

export function getCanvasSurfaceHost(surface: Readonly<CanvasSurface>): Readonly<HostCanvasCapability> | null {
  return _ownedSurfaces.get(surface as CanvasSurface) ?? null;
}

export function registerCanvasHost(state: CanvasRenderState, canvasHost: Readonly<HostCanvasCapability>): void {
  getCanvasRenderStateRuntime(state).canvasHost = canvasHost;
}

const _ownedSurfaces = new WeakMap<CanvasSurface, Readonly<HostCanvasCapability>>();
