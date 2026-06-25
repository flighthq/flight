import {
  acquireFilterSurfaceScratch,
  createFilterSurfaceScratch,
  getFilterSurfaceScratchByteLength,
  releaseFilterSurfaceScratch,
} from './surfaceFilterScratch';

describe('acquireFilterSurfaceScratch', () => {
  it('returns a buffer of at least the requested byte length', () => {
    const buf = acquireFilterSurfaceScratch(8, 8);
    expect(buf.byteLength).toBeGreaterThanOrEqual(8 * 8 * 4);
    releaseFilterSurfaceScratch(buf);
  });
  it('returns the same buffer after release', () => {
    const buf1 = acquireFilterSurfaceScratch(4, 4);
    releaseFilterSurfaceScratch(buf1);
    const buf2 = acquireFilterSurfaceScratch(4, 4);
    expect(buf2).toBe(buf1);
    releaseFilterSurfaceScratch(buf2);
  });
  it('allocates a new buffer if the pooled one is still in use', () => {
    const buf1 = acquireFilterSurfaceScratch(4, 4);
    const buf2 = acquireFilterSurfaceScratch(4, 4);
    expect(buf1).not.toBe(buf2);
    releaseFilterSurfaceScratch(buf1);
    releaseFilterSurfaceScratch(buf2);
  });
  it('allocates a new buffer if existing pool entry is too small', () => {
    const small = acquireFilterSurfaceScratch(1, 1);
    releaseFilterSurfaceScratch(small);
    const large = acquireFilterSurfaceScratch(32, 32);
    expect(large.byteLength).toBeGreaterThanOrEqual(32 * 32 * 4);
    releaseFilterSurfaceScratch(large);
  });
});

describe('createFilterSurfaceScratch', () => {
  it('returns a buffer of exactly width * height * 4 bytes', () => {
    const buf = createFilterSurfaceScratch(10, 20);
    expect(buf.byteLength).toBe(10 * 20 * 4);
  });
  it('allocates a fresh buffer each call', () => {
    const a = createFilterSurfaceScratch(4, 4);
    const b = createFilterSurfaceScratch(4, 4);
    expect(a).not.toBe(b);
  });
});

describe('getFilterSurfaceScratchByteLength', () => {
  it('returns width * height * 4', () => {
    expect(getFilterSurfaceScratchByteLength(10, 10)).toBe(400);
    expect(getFilterSurfaceScratchByteLength(1, 1)).toBe(4);
    expect(getFilterSurfaceScratchByteLength(0, 0)).toBe(0);
  });
});

describe('releaseFilterSurfaceScratch', () => {
  it('does not throw for unknown buffer (graceful no-op)', () => {
    const foreign = new Uint8ClampedArray(16);
    expect(() => releaseFilterSurfaceScratch(foreign)).not.toThrow();
  });
});
