import type { BackendExplanation, Raster2DSurface, Raster2DSurfaceProvider } from '@flighthq/types/contract';

export function createRaster2DSurface(width: number, height: number): Raster2DSurface | null {
  return getRaster2DSurfaceProvider().createRaster2DSurface(width, height);
}

export function explainRaster2DSurfaceProvider(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return { conflict: _hostConflict, layer: 'host', operation: null, viability: 'unobserved' };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getRaster2DSurfaceProvider(): Readonly<Raster2DSurfaceProvider> {
  return _custom ?? _host ?? _sentinel;
}

export function hasRaster2DSurfaceHostProvider(): boolean {
  return _host !== null;
}

export function installRaster2DSurfaceHostProvider(provider: Readonly<Raster2DSurfaceProvider>): void {
  if (_host !== null) {
    if (_host !== provider) _hostConflict = true;
    return;
  }
  _host = provider;
}

export function resetRaster2DSurfaceProviderForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
}

export function setRaster2DSurfaceProvider(provider: Readonly<Raster2DSurfaceProvider> | null): void {
  _custom = provider;
}

const _sentinel: Readonly<Raster2DSurfaceProvider> = {
  createRaster2DSurface(): null {
    return null;
  },
};

let _custom: Readonly<Raster2DSurfaceProvider> | null = null;
let _host: Readonly<Raster2DSurfaceProvider> | null = null;
let _hostConflict = false;
