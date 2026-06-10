import { compositeSurfacePixels, compositeSurfaceRegion } from '@flighthq/surface/composite';
import { createSurface } from '@flighthq/surface/surface';

import {
  applySurfaceDropShadowFilter,
  applySurfaceGlowFilter,
  applySurfaceInnerGlowFilter,
  applySurfaceInnerShadowFilter,
  tintSurfaceAlphaMask,
} from './shadow';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

// ─── tintSurfaceAlphaMask ─────────────────────────────────────────────────────

describe('applySurfaceDropShadowFilter', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceDropShadowFilter(out, scratch, region(source), { blurX: 0, blurY: 0, color: 0x0000ff });
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('compositing out at an offset places the shadow correctly', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(4, 4);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceDropShadowFilter(out, scratch, region(source), { blurX: 0, blurY: 0, color: 0x0000ff });
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
    applySurfaceDropShadowFilter(out, scratch, region(source), { blurX: 0, blurY: 0, color: 0x0000ff });
    compositeSurfacePixels(region(dest, 1, 0, 1, 1), out);
    compositeSurfaceRegion(region(dest, 0, 0, 1, 1), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });
});

// ─── applySurfaceDropShadowFilter ─────────────────────────────────────────────

describe('applySurfaceGlowFilter', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceGlowFilter(out, scratch, region(source), { blurX: 0, blurY: 0, color: 0x00ff00 });
    expect(out[1]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('compositing out places the glow at the same position', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceGlowFilter(out, scratch, region(source), { blurX: 0, blurY: 0, color: 0x00ff00 });
    compositeSurfacePixels(region(dest), out);
    expect(dest.data[1]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('compositing source over glow produces source-over-glow', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const dest = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceGlowFilter(out, scratch, region(source), { blurX: 0, blurY: 0, color: 0x00ff00 });
    compositeSurfacePixels(region(dest), out);
    compositeSurfaceRegion(region(dest), region(source));
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });
});

describe('applySurfaceInnerGlowFilter', () => {
  it('clips the glow to inside the shape and tints it', () => {
    // 3x1: transparent | opaque | transparent. The inner glow appears only on
    // the opaque pixel; transparent pixels (outside the shape) stay at 0 alpha.
    const source = createSurface(3, 1);
    source.data[1 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    applySurfaceInnerGlowFilter(out, scratch, region(source), { blurX: 2, blurY: 0, color: 0x00ff00 });
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
    applySurfaceInnerGlowFilter(out, scratch, region(source), { blurX: 0, blurY: 0 });
    expect(out[3]).toBe(0);
  });
});

describe('applySurfaceInnerShadowFilter', () => {
  it('defaults to a black tint', () => {
    const source = createSurface(3, 1);
    source.data[1 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    applySurfaceInnerShadowFilter(out, scratch, region(source), { blurX: 2, blurY: 0 });
    expect(out[1 * 4 + 0]).toBe(0);
    expect(out[1 * 4 + 1]).toBe(0);
    expect(out[1 * 4 + 2]).toBe(0);
    expect(out[1 * 4 + 3]).toBe(170);
  });
});

describe('tintSurfaceAlphaMask', () => {
  it('replaces RGB with the tint color and preserves scaled alpha', () => {
    const source = createSurface(1, 1, 0x000000ff);
    const out = new Uint8ClampedArray(4);
    tintSurfaceAlphaMask(out, region(source), 0x00ff00, 1, 1);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0xff);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0xff);
  });

  it('scales alpha by alpha * strength', () => {
    const source = createSurface(1, 1, 0x000000ff);
    const out = new Uint8ClampedArray(4);
    tintSurfaceAlphaMask(out, region(source), 0xffffff, 0.5, 1);
    expect(out[3]).toBe(128);
  });

  it('clamps alpha at 255 when strength > 1', () => {
    const source = createSurface(1, 1, 0x00000080);
    const out = new Uint8ClampedArray(4);
    tintSurfaceAlphaMask(out, region(source), 0xffffff, 1, 4);
    expect(out[3]).toBe(255);
  });
});
