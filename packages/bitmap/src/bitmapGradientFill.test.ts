import { createBitmap } from './bitmap';
import { buildBitmapGradientRamp } from './bitmapGradient';
import { fillBitmapLinearGradient, fillBitmapRadialGradient } from './bitmapGradientFill';
import { getBitmapPixel } from './bitmapPixel';
import { createBitmapRegion } from './bitmapRegion';

function buildTwoStopRamp(colorA: number, colorB: number): Uint8ClampedArray {
  const ramp = new Uint8ClampedArray(1024);
  const aR = (colorA >>> 24) & 0xff;
  const aG = (colorA >> 16) & 0xff;
  const aB = (colorA >> 8) & 0xff;
  const aA = colorA & 0xff;
  const bR = (colorB >>> 24) & 0xff;
  const bG = (colorB >> 16) & 0xff;
  const bB = (colorB >> 8) & 0xff;
  const bA = colorB & 0xff;
  buildBitmapGradientRamp(
    ramp,
    [(aR << 16) | (aG << 8) | aB, (bR << 16) | (bG << 8) | bB],
    [aA / 255, bA / 255],
    [0, 255],
  );
  return ramp;
}

describe('fillBitmapLinearGradient', () => {
  it('fills leftmost pixel with the first stop color', () => {
    const surf = createBitmap(4, 1);
    const region = createBitmapRegion(surf);
    const ramp = buildTwoStopRamp(0xff0000ff, 0x0000ffff);
    fillBitmapLinearGradient(region, ramp, 0, 0, 3, 0);
    const pixel = getBitmapPixel(surf, 0, 0);
    expect((pixel >>> 24) & 0xff).toBeCloseTo(0xff, -1);
    expect((pixel >> 8) & 0xff).toBeCloseTo(0x00, -1);
  });

  it('fills rightmost pixel with the last stop color', () => {
    const surf = createBitmap(4, 1);
    const region = createBitmapRegion(surf);
    const ramp = buildTwoStopRamp(0xff0000ff, 0x0000ffff);
    fillBitmapLinearGradient(region, ramp, 0, 0, 3, 0);
    const pixel = getBitmapPixel(surf, 3, 0);
    expect((pixel >>> 24) & 0xff).toBeCloseTo(0x00, -1);
    expect((pixel >> 8) & 0xff).toBeCloseTo(0xff, -1);
  });

  it('middle pixel is a blend of both stops', () => {
    const surf = createBitmap(3, 1);
    const region = createBitmapRegion(surf);
    const ramp = buildTwoStopRamp(0x000000ff, 0xffffffff);
    fillBitmapLinearGradient(region, ramp, 0, 0, 2, 0);
    const mid = getBitmapPixel(surf, 1, 0);
    const r = (mid >>> 24) & 0xff;
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(255);
  });

  it('pad spread clamps colors outside axis', () => {
    const surf = createBitmap(5, 1);
    const region = createBitmapRegion(surf);
    // Gradient from x=1 to x=3; pixels at x=0 and x=4 should get clamped stops.
    const ramp = buildTwoStopRamp(0xff0000ff, 0x0000ffff);
    fillBitmapLinearGradient(region, ramp, 1, 0, 3, 0, 'pad');
    const left = getBitmapPixel(surf, 0, 0);
    const right = getBitmapPixel(surf, 4, 0);
    expect((left >>> 24) & 0xff).toBe((getBitmapPixel(surf, 1, 0) >>> 24) & 0xff);
    expect((right >> 8) & 0xff).toBe((getBitmapPixel(surf, 3, 0) >> 8) & 0xff);
  });

  it('skips pixels outside bitmap bounds', () => {
    const surf = createBitmap(2, 2);
    // Region that extends outside bitmap — should not throw.
    const region = { bitmap: surf, x: -1, y: 0, width: 4, height: 1 };
    const ramp = buildTwoStopRamp(0xff0000ff, 0x0000ffff);
    expect(() => fillBitmapLinearGradient(region, ramp, 0, 0, 3, 0)).not.toThrow();
  });
});

describe('fillBitmapRadialGradient', () => {
  it('center pixel gets the first stop color', () => {
    const surf = createBitmap(5, 5);
    const region = createBitmapRegion(surf);
    const ramp = buildTwoStopRamp(0xff0000ff, 0x0000ffff);
    fillBitmapRadialGradient(region, ramp, 2, 2, 2);
    // Center is at distance 0, so t=0, gets first stop.
    const pixel = getBitmapPixel(surf, 2, 2);
    expect((pixel >>> 24) & 0xff).toBeCloseTo(0xff, -1);
  });

  it('pad spread clamps beyond radius to last stop', () => {
    const surf = createBitmap(9, 1);
    const region = createBitmapRegion(surf);
    const ramp = buildTwoStopRamp(0xff0000ff, 0x0000ffff);
    // Center at x=4, radius=2; pixels at x=0 and x=8 are far outside.
    fillBitmapRadialGradient(region, ramp, 4, 0, 2, 4, 0, 'pad');
    const far = getBitmapPixel(surf, 0, 0);
    // Should be clamped to last stop (blue).
    expect((far >> 8) & 0xff).toBeCloseTo(0xff, -1);
  });

  it('skips pixels outside bitmap bounds', () => {
    const surf = createBitmap(2, 2);
    const region = { bitmap: surf, x: -1, y: 0, width: 4, height: 1 };
    const ramp = buildTwoStopRamp(0xff0000ff, 0x0000ffff);
    expect(() => fillBitmapRadialGradient(region, ramp, 1, 0, 2)).not.toThrow();
  });
});
