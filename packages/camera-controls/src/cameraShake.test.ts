import { describe, expect, it } from 'vitest';

import {
  addCameraShakeTrauma,
  createCameraShake,
  createCameraShakeOffset,
  resetCameraShake,
  updateCameraShake,
} from './cameraShake';

describe('addCameraShakeTrauma', () => {
  it('accumulates trauma clamped to 1', () => {
    const shake = createCameraShake();
    addCameraShakeTrauma(shake, 0.3);
    expect(shake.trauma).toBe(0.3);
    addCameraShakeTrauma(shake, 0.5);
    expect(shake.trauma).toBe(0.8);
    addCameraShakeTrauma(shake, 0.5);
    expect(shake.trauma).toBe(1);
  });

  it('does not go below zero', () => {
    const shake = createCameraShake();
    addCameraShakeTrauma(shake, -1);
    expect(shake.trauma).toBe(0);
  });
});

describe('createCameraShake', () => {
  it('creates with default values', () => {
    const shake = createCameraShake();
    expect(shake.trauma).toBe(0);
    expect(shake.decay).toBe(1.5);
    expect(shake.frequency).toBe(15);
    expect(shake.translationAmplitude).toBe(0.5);
    expect(shake.rotationAmplitude).toBe(3);
    expect(shake.time).toBe(0);
  });

  it('accepts custom options', () => {
    const shake = createCameraShake({ decay: 2, frequency: 20, translationAmplitude: 1, rotationAmplitude: 5 });
    expect(shake.decay).toBe(2);
    expect(shake.frequency).toBe(20);
    expect(shake.translationAmplitude).toBe(1);
    expect(shake.rotationAmplitude).toBe(5);
  });
});

describe('createCameraShakeOffset', () => {
  it('creates a zeroed offset', () => {
    const out = createCameraShakeOffset();
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.z).toBe(0);
    expect(out.rotationX).toBe(0);
    expect(out.rotationY).toBe(0);
    expect(out.rotationZ).toBe(0);
  });
});

describe('resetCameraShake', () => {
  it('zeros trauma and time', () => {
    const shake = createCameraShake();
    addCameraShakeTrauma(shake, 0.8);
    const out = createCameraShakeOffset();
    updateCameraShake(shake, 0.1, out);
    expect(shake.trauma).toBeGreaterThan(0);
    expect(shake.time).toBeGreaterThan(0);
    resetCameraShake(shake);
    expect(shake.trauma).toBe(0);
    expect(shake.time).toBe(0);
  });
});

describe('updateCameraShake', () => {
  it('produces zero offset when trauma is zero', () => {
    const shake = createCameraShake();
    const out = createCameraShakeOffset();
    updateCameraShake(shake, 1 / 60, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.z).toBe(0);
    expect(out.rotationX).toBe(0);
    expect(out.rotationY).toBe(0);
    expect(out.rotationZ).toBe(0);
  });

  it('produces non-zero offset when trauma is active', () => {
    const shake = createCameraShake();
    addCameraShakeTrauma(shake, 1);
    const out = createCameraShakeOffset();
    updateCameraShake(shake, 0.05, out);
    const magnitude = Math.hypot(out.x, out.y, out.z);
    expect(magnitude).toBeGreaterThan(0);
  });

  it('decays trauma over time', () => {
    const shake = createCameraShake({ decay: 2 });
    addCameraShakeTrauma(shake, 1);
    const out = createCameraShakeOffset();
    updateCameraShake(shake, 0.25, out);
    expect(shake.trauma).toBeCloseTo(0.5, 10);
    updateCameraShake(shake, 0.25, out);
    expect(shake.trauma).toBe(0);
  });

  it('scales offset quadratically with trauma', () => {
    const shake = createCameraShake({ decay: 0 });
    const out = createCameraShakeOffset();

    shake.trauma = 1;
    shake.time = 0;
    updateCameraShake(shake, 0.1, out);
    const fullX = out.x;

    shake.trauma = 0.5;
    shake.time = 0;
    updateCameraShake(shake, 0.1, out);
    const halfX = out.x;

    expect(Math.abs(halfX / fullX)).toBeCloseTo(0.25, 1);
  });

  it('advances time deterministically', () => {
    const shakeA = createCameraShake({ decay: 0 });
    const shakeB = createCameraShake({ decay: 0 });
    addCameraShakeTrauma(shakeA, 0.7);
    addCameraShakeTrauma(shakeB, 0.7);
    const outA = createCameraShakeOffset();
    const outB = createCameraShakeOffset();

    updateCameraShake(shakeA, 0.016, outA);
    updateCameraShake(shakeA, 0.016, outA);
    updateCameraShake(shakeB, 0.016, outB);
    updateCameraShake(shakeB, 0.016, outB);

    expect(outA.x).toBe(outB.x);
    expect(outA.y).toBe(outB.y);
    expect(outA.rotationZ).toBe(outB.rotationZ);
  });

  it('keeps offsets within amplitude bounds', () => {
    const shake = createCameraShake({ decay: 0, translationAmplitude: 1, rotationAmplitude: 5 });
    addCameraShakeTrauma(shake, 1);
    const out = createCameraShakeOffset();

    for (let i = 0; i < 100; i += 1) {
      updateCameraShake(shake, 0.01, out);
      expect(Math.abs(out.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.z)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.rotationX)).toBeLessThanOrEqual(5);
      expect(Math.abs(out.rotationY)).toBeLessThanOrEqual(5);
      expect(Math.abs(out.rotationZ)).toBeLessThanOrEqual(5);
    }
  });
});
