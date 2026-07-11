import { createBloomEffect } from './bloomEffect';
import { createColorGradeEffect } from './colorGradeEffect';
import { canLerpRenderEffects, lerpRenderEffect } from './renderEffectInterpolation';

describe('canLerpRenderEffects', () => {
  it('returns true for same kind', () => {
    expect(canLerpRenderEffects(createBloomEffect(), createBloomEffect())).toBe(true);
  });
  it('returns false for different kinds', () => {
    expect(canLerpRenderEffects(createBloomEffect(), createColorGradeEffect())).toBe(false);
  });
});

describe('lerpRenderEffect', () => {
  it('returns false and leaves out unchanged for mismatched kinds', () => {
    const a = createBloomEffect({ threshold: 0.5 });
    const b = createColorGradeEffect({ exposure: 1 });
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
  it('boolean fields snap at t=0.5 boundary', () => {
    const a = createColorGradeEffect({ enabled: false } as never);
    const b = createColorGradeEffect({ enabled: true } as never);
    const out = createColorGradeEffect();
    lerpRenderEffect(a, b, 0.4, out);
    expect((out as unknown as Record<string, unknown>).enabled).toBe(false);
    lerpRenderEffect(a, b, 0.5, out);
    expect((out as unknown as Record<string, unknown>).enabled).toBe(true);
  });
});
