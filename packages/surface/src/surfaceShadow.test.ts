import { createSurface } from './surface';
import { compositeSurfacePixels, compositeSurfaceRegion } from './surfaceComposite';
import { dropShadowSurface, glowSurface, innerGlowSurface, innerShadowSurface } from './surfaceShadow';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('dropShadowSurface', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    dropShadowSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('compositing out at an offset places the shadow correctly', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(4, 4);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    dropShadowSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    const angle = (0 * Math.PI) / 180;
    const offsetX = Math.round(Math.cos(angle) * 1);
    const offsetY = Math.round(Math.sin(angle) * 1);
    compositeSurfacePixels(region(dest, 1 + offsetX, 1 + offsetY, 1, 1), out);
    const i = (1 * dest.width + 2) * 4;
    expect(dest.data[i + 2]).toBe(0xff);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('compositing shadow then source produces source-over-shadow', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const dest = createSurface(2, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    dropShadowSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    compositeSurfacePixels(region(dest, 1, 0, 1, 1), out);
    compositeSurfaceRegion(region(dest, 0, 0, 1, 1), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('source.surface.data can be used as out for a full-surface region', () => {
    const surface = createSurface(1, 1, 0xffffffff);
    const scratch = new Uint8ClampedArray(4);
    dropShadowSurface(surface.data, scratch, region(surface), { radiusX: 0, radiusY: 0, color: 0x0000ffff });
    expect(surface.data[2]).toBe(0xff); // tinted blue
    expect(surface.data[3]).toBe(0xff); // alpha carried from source
  });
});

describe('glowSurface', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    glowSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    expect(out[1]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('compositing out places the glow at the same position', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    glowSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    compositeSurfacePixels(region(dest), out);
    expect(dest.data[1]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('compositing source over glow produces source-over-glow', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const dest = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    glowSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    compositeSurfacePixels(region(dest), out);
    compositeSurfaceRegion(region(dest), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('source.surface.data can be used as out for a full-surface region', () => {
    const surface = createSurface(1, 1, 0xffffffff);
    const scratch = new Uint8ClampedArray(4);
    glowSurface(surface.data, scratch, region(surface), { radiusX: 0, radiusY: 0, color: 0x00ff00ff });
    expect(surface.data[1]).toBe(0xff);
    expect(surface.data[3]).toBe(0xff);
  });
});

describe('innerGlowSurface', () => {
  it('clips the glow to inside the shape and tints it', () => {
    // 3x1: transparent | opaque | transparent. The inner glow appears only on
    // the opaque pixel; transparent pixels (outside the shape) stay at 0 alpha.
    const source = createSurface(3, 1);
    source.data[1 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    innerGlowSurface(out, scratch, region(source), { radiusX: 2, radiusY: 0, color: 0x00ff00ff });
    expect(out[0 * 4 + 3]).toBe(0);
    expect(out[2 * 4 + 3]).toBe(0);
    expect(out[1 * 4 + 3]).toBe(170);
    expect(out[1 * 4 + 0]).toBe(0);
    expect(out[1 * 4 + 1]).toBe(0xff);
    expect(out[1 * 4 + 2]).toBe(0);
  });

  it('produces no inner glow when blur is zero', () => {
    const source = createSurface(1, 1, 0x0000ffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    innerGlowSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0 });
    expect(out[3]).toBe(0);
  });
});

describe('innerShadowSurface', () => {
  it('defaults to a black tint', () => {
    const source = createSurface(3, 1);
    source.data[1 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    innerShadowSurface(out, scratch, region(source), { radiusX: 2, radiusY: 0 });
    expect(out[1 * 4 + 0]).toBe(0);
    expect(out[1 * 4 + 1]).toBe(0);
    expect(out[1 * 4 + 2]).toBe(0);
    expect(out[1 * 4 + 3]).toBe(170);
  });

  it('gathers the shadow toward one edge when given a directional offset', () => {
    // A 3-px-wide filled bar (px 1..3) inside a 5-px row; px 0 and 4 are exterior.
    const source = createSurface(5, 1);
    for (let px = 1; px <= 3; px++) source.data[px * 4 + 3] = 255;
    const alphaAt = (offsetX: number): number[] => {
      const out = new Uint8ClampedArray(5 * 4);
      const scratch = new Uint8ClampedArray(5 * 4);
      innerShadowSurface(out, scratch, region(source), { offsetX, radiusX: 1, radiusY: 0 });
      return [out[1 * 4 + 3], out[2 * 4 + 3], out[3 * 4 + 3]];
    };
    // Zero offset rings the boundary evenly: the two interior edges match.
    const centered = alphaAt(0);
    expect(centered[0]).toBe(centered[2]);
    // A positive offset pulls the exterior in from the left, so the shadow gathers on the left edge.
    const shifted = alphaAt(2);
    expect(shifted[0]).toBeGreaterThan(shifted[2]);
    // The opposite offset mirrors it.
    const mirrored = alphaAt(-2);
    expect(mirrored[2]).toBeGreaterThan(mirrored[0]);
    expect(mirrored[0]).toBe(shifted[2]);
    expect(mirrored[2]).toBe(shifted[0]);
  });
});
