import type { Surface } from '@flighthq/types';

import { compareSurface } from './compare';
import { setSurfacePixel32 } from './pixel';
import { cloneSurface, createSurface } from './surface';

describe('compareSurface', () => {
  it('returns -1 when other is null', () => {
    const a = createSurface(4, 4, 0xff0000ff);
    expect(compareSurface(a, null)).toBe(-1);
  });

  it('returns -2 when widths differ', () => {
    const a = createSurface(4, 4);
    const b = createSurface(8, 4);
    expect(compareSurface(a, b)).toBe(-2);
  });

  it('returns -3 when heights differ', () => {
    const a = createSurface(4, 4);
    const b = createSurface(4, 8);
    expect(compareSurface(a, b)).toBe(-3);
  });

  it('returns 0 for identical images', () => {
    const a = createSurface(4, 4, 0xff0000ff);
    const b = cloneSurface(a);
    expect(compareSurface(a, b)).toBe(0);
  });

  it('returns diff Surface for different pixels', () => {
    const a = createSurface(2, 1, 0xff000000);
    const b = createSurface(2, 1, 0xff000000);
    setSurfacePixel32(b, 0, 0, 0xff102030);
    const result = compareSurface(a, b) as Surface;
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    expect(result.data[0]).toBe(0x10);
    expect(result.data[1]).toBe(0x20);
    expect(result.data[2]).toBe(0x30);
    expect(result.data[3]).toBe(255);
    expect(result.data[4]).toBe(0);
    expect(result.data[5]).toBe(0);
    expect(result.data[6]).toBe(0);
    expect(result.data[7]).toBe(0);
  });

  it('diff pixel alpha is 255 when any channel differs', () => {
    const a = createSurface(1, 1, 0xff000000);
    const b = createSurface(1, 1, 0x80000000);
    const result = compareSurface(a, b) as Surface;
    expect(result.data[3]).toBe(255);
  });

  it('unchanged pixels in diff have zero alpha', () => {
    const a = createSurface(2, 1, 0xff000000);
    const b = cloneSurface(a);
    setSurfacePixel32(b, 1, 0, 0xffff0000);
    const result = compareSurface(a, b) as Surface;
    expect(result.data[3]).toBe(0);
    expect(result.data[7]).toBe(255);
  });
});
