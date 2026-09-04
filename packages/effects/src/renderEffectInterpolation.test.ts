import { createBevelEffect } from './bevelEffect';
import { createBloomEffect } from './bloomEffect';
import { canLerpRenderEffects, lerpRenderEffect } from './renderEffectInterpolation';
import { createVignetteEffect } from './vignetteEffect';

describe('canLerpRenderEffects', () => {
  it('returns true for same kind', () => {
    expect(canLerpRenderEffects(createBloomEffect(), createBloomEffect())).toBe(true);
  });
  it('returns false for different kinds', () => {
    expect(canLerpRenderEffects(createBloomEffect(), createVignetteEffect())).toBe(false);
  });
});

describe('lerpRenderEffect', () => {
  it('returns false and leaves out unchanged for mismatched kinds', () => {
    const a = createBloomEffect({ threshold: 0.5 });
    const b = createVignetteEffect({ intensity: 1 });
    const out = createBloomEffect({ threshold: 0.99 });
    const result = lerpRenderEffect(a, b, 0.5, out);
    expect(result).toBe(false);
    expect(out.threshold).toBe(0.99);
  });
  it('at t=0 writes a values', () => {
    const a = createBloomEffect({ threshold: 0.2, radius: 4 });
    const b = createBloomEffect({ threshold: 0.8, radius: 16 });
    const out = createBloomEffect();
    lerpRenderEffect(a, b, 0, out);
    expect(out.threshold).toBeCloseTo(0.2, 5);
    expect(out.radius).toBeCloseTo(4, 5);
  });
  it('at t=1 writes b values', () => {
    const a = createBloomEffect({ threshold: 0.2, radius: 4 });
    const b = createBloomEffect({ threshold: 0.8, radius: 16 });
    const out = createBloomEffect();
    lerpRenderEffect(a, b, 1, out);
    expect(out.threshold).toBeCloseTo(0.8, 5);
    expect(out.radius).toBeCloseTo(16, 5);
  });
  it('at t=0.5 interpolates numeric fields', () => {
    const a = createBloomEffect({ threshold: 0, radius: 0 });
    const b = createBloomEffect({ threshold: 1, radius: 10 });
    const out = createBloomEffect();
    lerpRenderEffect(a, b, 0.5, out);
    expect(out.threshold).toBeCloseTo(0.5, 5);
    expect(out.radius).toBeCloseTo(5, 5);
  });
  it('returns true on success', () => {
    const a = createBloomEffect();
    const b = createBloomEffect();
    const out = createBloomEffect();
    expect(lerpRenderEffect(a, b, 0.5, out)).toBe(true);
  });
  it('is alias-safe when out === a', () => {
    const a = createBloomEffect({ threshold: 0, radius: 0 });
    const b = createBloomEffect({ threshold: 1, radius: 10 });
    lerpRenderEffect(a, b, 0.5, a);
    expect(a.threshold).toBeCloseTo(0.5, 5);
  });
  it('interpolates a packed colour per channel instead of lerping the integer', () => {
    // 0xff0000ff to 0x0000ffff. Lerping the packed integers linearly gives 0x7f8080ff — a washed-out
    // grey-blue that is in neither colour's hue, because the red byte's borrow runs into green.
    // Per-channel interpolation keeps green at zero throughout.
    const a = createVignetteEffect({ color: 0xff0000ff });
    const b = createVignetteEffect({ color: 0x0000ffff });
    const out = createVignetteEffect();
    lerpRenderEffect(a, b, 0.5, out);
    expect(channelOf(out.color as number, 1)).toBe(0);
    expect(out.color).not.toBe(Math.round(0xff0000ff + (0x0000ffff - 0xff0000ff) * 0.5));
  });

  it('holds a packed colour steady when both endpoints are the same colour', () => {
    // The integer lerp happens to be correct here, so this pins the property the fix must not break:
    // a channel that does not move must come back bit-identical rather than drifting by rounding.
    const a = createVignetteEffect({ color: 0x3366ccff });
    const b = createVignetteEffect({ color: 0x3366ccff });
    const out = createVignetteEffect();
    lerpRenderEffect(a, b, 0.37, out);
    expect(out.color).toBe(0x3366ccff);
  });

  it('returns each endpoint exactly at t=0 and t=1', () => {
    const a = createVignetteEffect({ color: 0xff0000ff });
    const b = createVignetteEffect({ color: 0x00ff00ff });
    const out = createVignetteEffect();
    lerpRenderEffect(a, b, 0, out);
    expect(out.color).toBe(0xff0000ff);
    lerpRenderEffect(a, b, 1, out);
    expect(out.color).toBe(0x00ff00ff);
  });

  it('writes a whole packed integer, never the fraction a scalar lerp lands on', () => {
    // Halfway between 0xff0000ff and 0x00ff0000 the scalar path computes 2147451007.5 — a colour field
    // holding a fraction is corrupt whatever its channels say, and asserting only on channel ranges
    // misses it because the truncated bytes still fall inside them.
    const a = createVignetteEffect({ color: 0xff0000ff });
    const b = createVignetteEffect({ color: 0x00ff0000 });
    const out = createVignetteEffect();
    lerpRenderEffect(a, b, 0.5, out);
    expect(Number.isInteger(out.color)).toBe(true);
    const alpha = channelOf(out.color as number, 3);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
  });

  it('treats every colour field on a kind that declares more than one', () => {
    // BevelEffect carries highlightColor AND shadowColor. A fix that special-cased a field named
    // exactly "color" would pass every other test here and corrupt both of these.
    const a = createBevelEffect({ highlightColor: 0xff0000ff, shadowColor: 0xff0000ff });
    const b = createBevelEffect({ highlightColor: 0x0000ffff, shadowColor: 0x0000ffff });
    const out = createBevelEffect();
    lerpRenderEffect(a, b, 0.5, out);
    expect(channelOf(out.highlightColor as number, 1)).toBe(0);
    expect(channelOf(out.shadowColor as number, 1)).toBe(0);
  });

  it('still lerps an ordinary scalar linearly on a kind that also carries a colour', () => {
    // The colour path must not swallow the scalars beside it.
    const a = createVignetteEffect({ color: 0xff0000ff, intensity: 0 });
    const b = createVignetteEffect({ color: 0x0000ffff, intensity: 1 });
    const out = createVignetteEffect();
    lerpRenderEffect(a, b, 0.25, out);
    expect(out.intensity).toBeCloseTo(0.25, 5);
  });

  it('is alias-safe for a colour field when out === a', () => {
    const a = createVignetteEffect({ color: 0xff0000ff });
    const b = createVignetteEffect({ color: 0x0000ffff });
    lerpRenderEffect(a, b, 0.5, a);
    expect(channelOf(a.color as number, 1)).toBe(0);
  });

  it('boolean fields snap at t=0.5 boundary', () => {
    const a = createVignetteEffect();
    (a as unknown as Record<string, unknown>).enabled = false;
    const b = createVignetteEffect();
    (b as unknown as Record<string, unknown>).enabled = true;
    const out = createVignetteEffect();
    lerpRenderEffect(a, b, 0.4, out);
    expect((out as unknown as Record<string, unknown>).enabled).toBe(false);
    lerpRenderEffect(a, b, 0.5, out);
    expect((out as unknown as Record<string, unknown>).enabled).toBe(true);
  });
});

// Reads one 0-255 channel out of a packed sRGB RGBA integer. Index 0 is red, 3 is alpha.
function channelOf(color: number, index: number): number {
  return (color >>> (24 - index * 8)) & 0xff;
}
