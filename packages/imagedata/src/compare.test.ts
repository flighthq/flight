import { describe, expect, it } from 'vitest';

import { compareImageData } from './compare';
import { cloneImageData, createImageData } from './imageData';
import { setPixel32 } from './pixel';

describe('compareImageData', () => {
  it('returns -1 when other is null', () => {
    const a = createImageData(4, 4, 0xff0000ff);
    expect(compareImageData(a, null)).toBe(-1);
  });

  it('returns -2 when widths differ', () => {
    const a = createImageData(4, 4);
    const b = createImageData(8, 4);
    expect(compareImageData(a, b)).toBe(-2);
  });

  it('returns -3 when heights differ', () => {
    const a = createImageData(4, 4);
    const b = createImageData(4, 8);
    expect(compareImageData(a, b)).toBe(-3);
  });

  it('returns 0 for identical images', () => {
    const a = createImageData(4, 4, 0xff0000ff);
    const b = cloneImageData(a);
    expect(compareImageData(a, b)).toBe(0);
  });

  it('returns diff ImageData for different pixels', () => {
    const a = createImageData(2, 1, 0xff000000);
    const b = createImageData(2, 1, 0xff000000);
    setPixel32(b, 0, 0, 0xff102030);
    const result = compareImageData(a, b) as ImageData;
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
    const a = createImageData(1, 1, 0xff000000);
    const b = createImageData(1, 1, 0x80000000);
    const result = compareImageData(a, b) as ImageData;
    expect(result.data[3]).toBe(255);
  });

  it('unchanged pixels in diff have zero alpha', () => {
    const a = createImageData(2, 1, 0xff000000);
    const b = cloneImageData(a);
    setPixel32(b, 1, 0, 0xffff0000);
    const result = compareImageData(a, b) as ImageData;
    expect(result.data[3]).toBe(0);
    expect(result.data[7]).toBe(255);
  });
});
