import type { CanvasSurface, HostCanvasCapability } from '@flighthq/types/contract';

export function createCanvasHostSurface(
  host: Readonly<HostCanvasCapability>,
  width: number,
  height: number,
): CanvasSurface | null {
  const surface = host.createSurface(width, height);
  if (surface !== null) _surfaceHosts.set(surface, host);
  return surface;
}

// A surface must return to the host that allocated it even when the host reference changes during its
// lifetime. Delete the ownership record before invoking the host so repeated or reentrant destruction is
// a no-op and no non-GC resource can be freed twice.
export function destroyCanvasHostSurface(surface: CanvasSurface): void {
  const host = _surfaceHosts.get(surface);
  if (host === undefined) return;
  _surfaceHosts.delete(surface);
  host.destroySurface(surface);
}

export function getCanvasHostSurface(surface: CanvasSurface): Readonly<HostCanvasCapability> | null {
  return _surfaceHosts.get(surface) ?? null;
}

const _surfaceHosts = new WeakMap<CanvasSurface, Readonly<HostCanvasCapability>>();
