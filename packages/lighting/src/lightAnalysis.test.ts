import { createBoundingSphere } from '@flighthq/geometry';

import { createAmbientLight } from './ambientLight';
import { createAreaLight } from './areaLight';
import { createDirectionalLight } from './directionalLight';
import { createEnvironment } from './environment';
import { createHemisphereLight } from './hemisphereLight';
import {
  getLightContributionAtBoundingSphere,
  getLightInfluenceBounds,
  getLightLuminance,
  hasLightInfluenceOnBounds,
  isLightShadowCasting,
} from './lightAnalysis';
import { createPointLight } from './pointLight';
import { createSpotLight } from './spotLight';

describe('getLightContributionAtBoundingSphere', () => {
  it('matches inverse-square attenuation for an infinite-range point light', () => {
    const light = createPointLight({ intensity: 1, position: { x: 0, y: 0, z: 0 }, range: -1 });
    const near = getLightContributionAtBoundingSphere(light, createBoundingSphere(2, 0, 0, 0));
    const far = getLightContributionAtBoundingSphere(light, createBoundingSphere(4, 0, 0, 0));
    expect(near / far).toBeCloseTo(4);
  });

  it('applies radius slack at the nearest sphere surface', () => {
    const light = createPointLight({ position: { x: 0, y: 0, z: 0 }, range: -1 });
    const point = getLightContributionAtBoundingSphere(light, createBoundingSphere(4, 0, 0, 0));
    const sphere = getLightContributionAtBoundingSphere(light, createBoundingSphere(4, 0, 0, 2));
    expect(sphere / point).toBeCloseTo(4);
  });

  it('applies the squared smooth range window and reaches zero at the range', () => {
    const light = createPointLight({ position: { x: 0, y: 0, z: 0 }, range: 4 });
    const inside = getLightContributionAtBoundingSphere(light, createBoundingSphere(2, 0, 0, 0));
    const edge = getLightContributionAtBoundingSphere(light, createBoundingSphere(4, 0, 0, 0));
    expect(inside).toBeGreaterThan(0);
    expect(edge).toBe(0);
  });

  it('applies spot smoothstep cone attenuation', () => {
    const light = createSpotLight({
      direction: { x: 1, y: 0, z: 0 },
      innerConeDegrees: 10,
      outerConeDegrees: 30,
      position: { x: 0, y: 0, z: 0 },
      range: -1,
    });
    const inside = getLightContributionAtBoundingSphere(light, createBoundingSphere(4, 0, 0, 0));
    const outside = getLightContributionAtBoundingSphere(light, createBoundingSphere(0, 4, 0, 0));
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBe(0);
  });

  it('returns zero for empty bounds', () => {
    expect(getLightContributionAtBoundingSphere(createPointLight(), createBoundingSphere(0, 0, 0, -1))).toBe(0);
  });
});

describe('getLightInfluenceBounds', () => {
  it('returns sentinel radius (-1) for ambient lights', () => {
    const light = createAmbientLight();
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.radius).toBe(-1);
  });

  it('returns sentinel radius for hemisphere lights', () => {
    const light = createHemisphereLight();
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.radius).toBe(-1);
  });

  it('returns sentinel radius for directional lights', () => {
    const light = createDirectionalLight();
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.radius).toBe(-1);
  });

  it('returns sentinel radius for environment lights', () => {
    const light = createEnvironment();
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.radius).toBe(-1);
  });

  it('returns sentinel radius for infinite-range point light', () => {
    const light = createPointLight({ range: -1 });
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.radius).toBe(-1);
  });

  it('returns position + range sphere for finite-range point light', () => {
    const light = createPointLight({ position: { x: 1, y: 2, z: 3 }, range: 5 });
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.center.x).toBe(1);
    expect(out.center.y).toBe(2);
    expect(out.center.z).toBe(3);
    expect(out.radius).toBe(5);
  });

  it('returns position + range sphere for finite-range spot light', () => {
    const light = createSpotLight({ position: { x: 0, y: 10, z: 0 }, range: 8 });
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.center.y).toBe(10);
    expect(out.radius).toBe(8);
  });

  it('returns position + range sphere for finite-range area light', () => {
    const light = createAreaLight({ position: { x: 5, y: 0, z: 0 }, range: 3 });
    const out = createBoundingSphere();
    getLightInfluenceBounds(out, light);
    expect(out.center.x).toBe(5);
    expect(out.radius).toBe(3);
  });
});

describe('getLightLuminance', () => {
  it('returns 0 for lights without a color field', () => {
    const light = createEnvironment({ intensity: 5 });
    // Environment has no color field — luminance should fall back to 0.
    // (environment light has no color field in its type; cast to bypass type)
    expect(getLightLuminance(light)).toBe(0);
  });

  it('returns zero for black (0x000000ff)', () => {
    const light = createAmbientLight({ color: 0x000000ff, intensity: 1 });
    expect(getLightLuminance(light)).toBeCloseTo(0, 6);
  });

  it('returns nonzero luminance for white at unit intensity', () => {
    const light = createAmbientLight({ color: 0xffffffff, intensity: 1 });
    expect(getLightLuminance(light)).toBeCloseTo(1, 4);
  });

  it('scales luminance by intensity', () => {
    const a = createAmbientLight({ color: 0xffffffff, intensity: 2 });
    const b = createAmbientLight({ color: 0xffffffff, intensity: 4 });
    expect(getLightLuminance(b) / getLightLuminance(a)).toBeCloseTo(2, 4);
  });

  it('uses BT.709 green weighting (green > red > blue)', () => {
    const red = createAmbientLight({ color: 0xff0000ff, intensity: 1 });
    const green = createAmbientLight({ color: 0x00ff00ff, intensity: 1 });
    const blue = createAmbientLight({ color: 0x0000ffff, intensity: 1 });
    expect(getLightLuminance(green)).toBeGreaterThan(getLightLuminance(red));
    expect(getLightLuminance(red)).toBeGreaterThan(getLightLuminance(blue));
  });
});

describe('hasLightInfluenceOnBounds', () => {
  it('returns true for ambient lights (unlimited reach)', () => {
    const light = createAmbientLight();
    const bounds = createBoundingSphere(100, 0, 0, 1);
    expect(hasLightInfluenceOnBounds(light, bounds)).toBe(true);
  });

  it('returns true for directional lights (unlimited reach)', () => {
    const light = createDirectionalLight();
    const bounds = createBoundingSphere(1000, 0, 0, 1);
    expect(hasLightInfluenceOnBounds(light, bounds)).toBe(true);
  });

  it('returns true for overlapping point light and bounds', () => {
    const light = createPointLight({ position: { x: 0, y: 0, z: 0 }, range: 10 });
    const bounds = createBoundingSphere(5, 0, 0, 2);
    expect(hasLightInfluenceOnBounds(light, bounds)).toBe(true);
  });

  it('returns false for non-overlapping point light and bounds', () => {
    const light = createPointLight({ position: { x: 0, y: 0, z: 0 }, range: 5 });
    const bounds = createBoundingSphere(20, 0, 0, 1);
    expect(hasLightInfluenceOnBounds(light, bounds)).toBe(false);
  });

  it('returns false for empty bounds (radius < 0)', () => {
    const light = createPointLight({ position: { x: 0, y: 0, z: 0 }, range: 10 });
    const bounds = createBoundingSphere(0, 0, 0, -1);
    expect(hasLightInfluenceOnBounds(light, bounds)).toBe(false);
  });

  it('returns true for infinite-range point light regardless of distance', () => {
    const light = createPointLight({ position: { x: 0, y: 0, z: 0 }, range: -1 });
    const bounds = createBoundingSphere(999, 0, 0, 1);
    expect(hasLightInfluenceOnBounds(light, bounds)).toBe(true);
  });
});

describe('isLightShadowCasting', () => {
  it('returns false for ambient lights', () => {
    expect(isLightShadowCasting(createAmbientLight())).toBe(false);
  });

  it('returns false for hemisphere lights', () => {
    expect(isLightShadowCasting(createHemisphereLight())).toBe(false);
  });

  it('returns false for environment lights', () => {
    expect(isLightShadowCasting(createEnvironment())).toBe(false);
  });

  it('returns false for directional lights with castsShadow: false', () => {
    const light = createDirectionalLight({ castsShadow: false });
    expect(isLightShadowCasting(light)).toBe(false);
  });

  it('returns true for directional lights with castsShadow: true', () => {
    const light = createDirectionalLight({ castsShadow: true });
    expect(isLightShadowCasting(light)).toBe(true);
  });

  it('returns true for point lights with castsShadow: true', () => {
    const light = createPointLight({ castsShadow: true });
    expect(isLightShadowCasting(light)).toBe(true);
  });

  it('returns true for spot lights with castsShadow: true', () => {
    const light = createSpotLight({ castsShadow: true });
    expect(isLightShadowCasting(light)).toBe(true);
  });

  it('returns true for area lights with castsShadow: true', () => {
    const light = createAreaLight({ castsShadow: true });
    expect(isLightShadowCasting(light)).toBe(true);
  });
});
