import { createColorGradeAdjustment } from './colorGradeAdjustment';
import { bakeColorLut } from './colorLut';
import { getAdjustmentColorTransform } from './colorLutAdjustment';
import { bakeColorLutForRun, createColorLutCache } from './colorLutCache';
import { createHueSaturationAdjustment } from './hueSaturationAdjustment';

describe('bakeColorLutForRun', () => {
  it('reuses the same ColorLut reference for a content-identical run rebuilt with fresh objects', () => {
    const cache = createColorLutCache();
    // The run is rebuilt each frame with fresh descriptors and fresh transform closures — reference
    // identity differs, but the content signature is equal, so the bake is reused by identity.
    const first = bakeColorLutForRun(cache, [createHueSaturationAdjustment({ hue: 30, saturation: 0.5 })], 8);
    const second = bakeColorLutForRun(cache, [createHueSaturationAdjustment({ hue: 30, saturation: 0.5 })], 8);
    expect(second).toBe(first);
    expect(cache.lut).toBe(first);
    expect(cache.signature).not.toBeNull();
  });

  it('re-bakes into a new LUT when an op param changes', () => {
    const cache = createColorLutCache();
    const first = bakeColorLutForRun(cache, [createHueSaturationAdjustment({ saturation: 0.4 })], 8);
    const changed = bakeColorLutForRun(cache, [createHueSaturationAdjustment({ saturation: 0.8 })], 8);
    expect(changed).not.toBe(first);
    expect(changed.samples).not.toEqual(first.samples);
  });

  it('re-keys when the LUT size changes', () => {
    const cache = createColorLutCache();
    const small = bakeColorLutForRun(cache, [createHueSaturationAdjustment({ saturation: 0.4 })], 8);
    const large = bakeColorLutForRun(cache, [createHueSaturationAdjustment({ saturation: 0.4 })], 16);
    expect(large).not.toBe(small);
    expect(large.size).toBe(16);
  });

  it('bakes byte-for-byte the same samples as the uncached bakeColorLut', () => {
    const cache = createColorLutCache();
    const run = [createHueSaturationAdjustment({ hue: 45 }), createColorGradeAdjustment({ contrast: 1.2 })];
    const cached = bakeColorLutForRun(cache, run, 8);
    const uncached = bakeColorLut(
      run.map((op) => getAdjustmentColorTransform(op)!),
      8,
    );
    expect(cached.size).toBe(uncached.size);
    expect(cached.samples).toEqual(uncached.samples);
  });

  it('bakes an empty run into an identity LUT and caches it', () => {
    const cache = createColorLutCache();
    const lut = bakeColorLutForRun(cache, [], 4);
    expect(lut.size).toBe(4);
    expect(bakeColorLutForRun(cache, [], 4)).toBe(lut);
  });
});

describe('createColorLutCache', () => {
  it('starts empty', () => {
    const cache = createColorLutCache();
    expect(cache.signature).toBeNull();
    expect(cache.lut).toBeNull();
  });
});
