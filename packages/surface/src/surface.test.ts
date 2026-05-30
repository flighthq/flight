import { describe, expect, it } from 'vitest';

import { cloneSurface, createSurface } from './surface';

describe('cloneSurface', () => {
  it('produces identical values', () => {
    const img = createSurface(2, 2, 0xff102030);
    const clone = cloneSurface(img);
    expect(clone.width).toBe(img.width);
    expect(clone.height).toBe(img.height);
    expect(clone.data).toEqual(img.data);
  });

  it('is a deep copy', () => {
    const img = createSurface(2, 2, 0xff102030);
    const clone = cloneSurface(img);
    clone.data[0] = 0;
    expect(img.data[0]).toBe(0x10);
  });
});

describe('createSurface', () => {
  it('creates zeroed image data when no color provided', () => {
    const img = createSurface(2, 2);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(16);
    expect(img.data.every((v) => v === 0)).toBe(true);
  });

  it('fills with the given color', () => {
    const img = createSurface(2, 2, 0xff112233);
    expect(img.data[0]).toBe(0x11);
    expect(img.data[1]).toBe(0x22);
    expect(img.data[2]).toBe(0x33);
    expect(img.data[3]).toBe(0xff);
  });
});
