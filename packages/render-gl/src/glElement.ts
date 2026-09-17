import type { GlRenderSurfaceCreator } from '@flighthq/types/contract';

let _provider: Readonly<GlRenderSurfaceCreator> | null = null;

export function createGlCanvasElement(width: number, height: number, pixelRatio: number = 1): HTMLCanvasElement {
  const surface = createGlRenderSurface(width, height, pixelRatio);
  if (surface !== null) return surface;
  throw new Error(
    'No GL render surface is available. Web callers must run enableHostWebGlRenderSurface() before creating GL state; native callers must inject a GlRenderSurfaceCreator.',
  );
}

export function createGlRenderSurface(width: number, height: number, pixelRatio: number = 1): HTMLCanvasElement | null {
  return _provider?.createRenderSurface(width, height, pixelRatio) ?? null;
}

export function explainGlRenderSurfaceAbsence(): { reason: 'provider-not-installed' } | null {
  return _provider === null ? { reason: 'provider-not-installed' } : null;
}

export function getGlRenderSurfaceProvider(): Readonly<GlRenderSurfaceCreator> | null {
  return _provider;
}

export function resetGlRenderSurfaceProviderForTest(): void {
  _provider = null;
}

export function setGlRenderSurfaceProvider(provider: Readonly<GlRenderSurfaceCreator> | null): void {
  _provider = provider;
}
