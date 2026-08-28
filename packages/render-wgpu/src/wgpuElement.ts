import type { WgpuRenderSurfaceProvider } from '@flighthq/types/contract';

let _provider: Readonly<WgpuRenderSurfaceProvider> | null = null;

export function createWgpuCanvasElement(width: number, height: number, pixelRatio: number = 1): HTMLCanvasElement {
  const surface = createWgpuRenderSurface(width, height, pixelRatio);
  if (surface !== null) return surface;
  throw new Error(
    'No WGPU render surface is available. Web callers must run enableHostWebWgpuRenderSurface() before creating WGPU state; native callers must inject a WgpuRenderSurfaceProvider.',
  );
}

export function createWgpuRenderSurface(
  width: number,
  height: number,
  pixelRatio: number = 1,
): HTMLCanvasElement | null {
  return _provider?.createRenderSurface(width, height, pixelRatio) ?? null;
}

export function getWgpuRenderSurfaceProvider(): Readonly<WgpuRenderSurfaceProvider> | null {
  return _provider;
}

export function resetWgpuRenderSurfaceProviderForTest(): void {
  _provider = null;
}

export function setWgpuRenderSurfaceProvider(provider: Readonly<WgpuRenderSurfaceProvider> | null): void {
  _provider = provider;
}
