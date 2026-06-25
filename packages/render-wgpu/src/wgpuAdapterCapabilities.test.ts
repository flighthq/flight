import { getWgpuAdapterCapabilities } from './wgpuAdapterCapabilities';

function makeAdapter(features: ReadonlyArray<string> = [], limits: Record<string, number> = {}): GPUAdapter {
  return {
    features: new Set(features),
    limits: { maxTextureDimension2D: 8192, ...limits },
  } as unknown as GPUAdapter;
}

describe('getWgpuAdapterCapabilities', () => {
  it('returns false for supportsFloat32Filterable when feature is absent', () => {
    const caps = getWgpuAdapterCapabilities(makeAdapter([]));
    expect(caps.supportsFloat32Filterable).toBe(false);
  });

  it('returns true for supportsFloat32Filterable when feature is present', () => {
    const caps = getWgpuAdapterCapabilities(makeAdapter(['float32-filterable']));
    expect(caps.supportsFloat32Filterable).toBe(true);
  });

  it('returns false for supportsTimestampQuery when feature is absent', () => {
    const caps = getWgpuAdapterCapabilities(makeAdapter([]));
    expect(caps.supportsTimestampQuery).toBe(false);
  });

  it('returns true for supportsTimestampQuery when feature is present', () => {
    const caps = getWgpuAdapterCapabilities(makeAdapter(['timestamp-query']));
    expect(caps.supportsTimestampQuery).toBe(true);
  });

  it('reads maxTextureDimension2D from adapter limits', () => {
    const caps = getWgpuAdapterCapabilities(makeAdapter([], { maxTextureDimension2D: 16384 }));
    expect(caps.maxTextureDimension2D).toBe(16384);
  });

  it('falls back to 8192 when maxTextureDimension2D is absent from limits', () => {
    const adapter = {
      features: new Set(),
      limits: {},
    } as unknown as GPUAdapter;
    const caps = getWgpuAdapterCapabilities(adapter);
    expect(caps.maxTextureDimension2D).toBe(8192);
  });

  it('reports maxSampleCount of 4', () => {
    const caps = getWgpuAdapterCapabilities(makeAdapter([]));
    expect(caps.maxSampleCount).toBe(4);
  });
});
