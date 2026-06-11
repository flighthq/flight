import { BlendMode } from '@flighthq/types';

import { compositeSurfacePixels, compositeSurfaceRegion, extractSurfacePixels, writeSurfacePixels } from './composite';
import { createSurface } from './surface';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('compositeSurfacePixels', () => {
  it('alpha-composites pixels over the destination', () => {
    const dest = createSurface(1, 1, 0x0000ffff);
    const pixels = new Uint8ClampedArray([0xff, 0, 0, 0xff]);
    compositeSurfacePixels(region(dest), pixels);
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });

  it('blends semi-transparent source over destination', () => {
    const dest = createSurface(1, 1, 0x000000ff);
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0x80]);
    compositeSurfacePixels(region(dest), pixels);
    expect(dest.data[0]).toBeGreaterThan(0);
    expect(dest.data[0]).toBeLessThan(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('silently skips pixels outside destination bounds', () => {
    const dest = createSurface(1, 1);
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0xff]);
    compositeSurfacePixels(region(dest, 5, 5, 1, 1), pixels);
    expect(dest.data[3]).toBe(0);
  });

  it('multiply blend mode multiplies source and destination channels', () => {
    const dest = createSurface(1, 1, 0xff0000ff); // RGBA: opaque red
    const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
    compositeSurfacePixels(region(dest), pixels, BlendMode.Multiply);
    expect(dest.data[0]).toBe(128); // 255 * 128 / 255
    expect(dest.data[1]).toBe(0); // 0 * 128 / 255
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(255);
  });

  it('add blend mode clamps the sum of channels', () => {
    const dest = createSurface(1, 1, 0x640000ff); // RGBA: opaque dark red (R=100)
    const pixels = new Uint8ClampedArray([200, 0, 0, 255]);
    compositeSurfacePixels(region(dest), pixels, BlendMode.Add);
    expect(dest.data[0]).toBe(255); // min(255, 100 + 200)
  });

  it('defaults to source-over (Normal) when no blend mode is given', () => {
    const dest = createSurface(1, 1, 0xff0000ff); // RGBA: opaque red
    const pixels = new Uint8ClampedArray([0, 0, 255, 255]);
    compositeSurfacePixels(region(dest), pixels);
    expect(dest.data[0]).toBe(0);
    expect(dest.data[2]).toBe(255);
  });

  it('overlay blend mode darkens on dark backdrops', () => {
    const dest = createSurface(1, 1, 0x400000ff); // RGBA: R=64
    const pixels = new Uint8ClampedArray([200, 0, 0, 255]);
    compositeSurfacePixels(region(dest), pixels, BlendMode.Overlay);
    expect(dest.data[0]).toBe(100); // 2 * 64 * 200 / 255
  });

  it('hardlight blend mode is overlay with operands swapped', () => {
    const dest = createSurface(1, 1, 0xc80000ff); // RGBA: R=200
    const pixels = new Uint8ClampedArray([64, 0, 0, 255]);
    compositeSurfacePixels(region(dest), pixels, BlendMode.Hardlight);
    expect(dest.data[0]).toBe(100); // 2 * 200 * 64 / 255
  });

  it('invert blend mode inverts the backdrop, ignoring source color', () => {
    const dest = createSurface(1, 1, 0xc80000ff); // RGBA: R=200
    const pixels = new Uint8ClampedArray([0, 0, 0, 255]);
    compositeSurfacePixels(region(dest), pixels, BlendMode.Invert);
    expect(dest.data[0]).toBe(55); // 255 - 200
  });

  it('erase blend mode knocks alpha out of the backdrop, keeping color', () => {
    const dest = createSurface(1, 1, 0xff0000ff); // RGBA: opaque red
    const pixels = new Uint8ClampedArray([0, 0, 0, 128]);
    compositeSurfacePixels(region(dest), pixels, BlendMode.Erase);
    expect(dest.data[0]).toBe(255); // color untouched
    expect(dest.data[3]).toBe(127); // 255 * (1 - 128/255)
  });

  it('throws for blend modes with no surface meaning', () => {
    const dest = createSurface(1, 1);
    const pixels = new Uint8ClampedArray([0, 0, 0, 255]);
    expect(() => compositeSurfacePixels(region(dest), pixels, BlendMode.Shader)).toThrow(/not supported/);
    expect(() => compositeSurfacePixels(region(dest), pixels, BlendMode.Alpha)).toThrow(/not supported/);
  });
});

describe('compositeSurfaceRegion', () => {
  it('alpha-composites a region of one surface over another', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const dest = createSurface(1, 1, 0x0000ffff);
    compositeSurfaceRegion(region(dest), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[2]).toBe(0);
  });

  it('clips to the smaller of source and dest dimensions', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const dest = createSurface(3, 3);
    compositeSurfaceRegion(region(dest, 1, 1, 2, 2), region(source));
    expect(dest.data[(1 * 3 + 1) * 4]).toBe(0xff);
    expect(dest.data[(1 * 3 + 2) * 4]).toBe(0);
  });

  it('applies the blend mode to the source region', () => {
    const source = createSurface(1, 1, 0x808080ff); // RGBA: opaque gray
    const dest = createSurface(1, 1, 0xff0000ff); // RGBA: opaque red
    compositeSurfaceRegion(region(dest), region(source), BlendMode.Multiply);
    expect(dest.data[0]).toBe(128); // 255 * 128 / 255
    expect(dest.data[1]).toBe(0);
  });
});

describe('extractSurfacePixels', () => {
  it('copies a surface region into a tightly-packed buffer', () => {
    const source = createSurface(2, 2);
    const i = (1 * 2 + 1) * 4;
    source.data[i] = 0xff;
    source.data[i + 3] = 0xff;
    const out = new Uint8ClampedArray(4);
    extractSurfacePixels(out, region(source, 1, 1, 1, 1));
    expect(out[0]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('silently skips pixels outside source bounds', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4 * 4);
    extractSurfacePixels(out, region(source, -1, -1, 2, 2));
    const i = (1 * 2 + 1) * 4;
    expect(out[i]).toBe(0xff);
    expect(out[i + 3]).toBe(0xff);
    expect(out[0]).toBe(0);
  });

  it('source.surface.data can be passed as out for a full-surface extraction', () => {
    const source = createSurface(2, 2, 0xaabbccff);
    extractSurfacePixels(source.data, region(source));
    expect(source.data[0]).toBe(0xaa);
    expect(source.data[3]).toBe(0xff);
  });
});

describe('writeSurfacePixels', () => {
  it('writes pixels at the given destination region', () => {
    const dest = createSurface(3, 3);
    const pixels = new Uint8ClampedArray([0x33, 0x66, 0x99, 0xff]);
    writeSurfacePixels(region(dest, 1, 1, 1, 1), pixels);
    const i = (1 * 3 + 1) * 4;
    expect(dest.data[i]).toBe(0x33);
    expect(dest.data[i + 1]).toBe(0x66);
    expect(dest.data[i + 2]).toBe(0x99);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('overwrites existing content', () => {
    const dest = createSurface(1, 1, 0x0000ffff);
    const pixels = new Uint8ClampedArray([0xff, 0, 0, 0xff]);
    writeSurfacePixels(region(dest), pixels);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[0]).toBe(0xff);
  });

  it('silently clips writes outside destination bounds', () => {
    const dest = createSurface(1, 1);
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0xff]);
    writeSurfacePixels(region(dest, 5, 5, 1, 1), pixels);
    expect(dest.data[3]).toBe(0);
  });
});
