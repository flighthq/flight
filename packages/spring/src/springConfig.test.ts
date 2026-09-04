import { TAU } from '@flighthq/math/contract';
import { describe, expect, it } from 'vitest';

import {
  SpringPresetBouncy,
  SpringPresetGentle,
  SpringPresetStiff,
  createSpringConfig,
  createSpringConfigFromPhysical,
  initializeSpringConfig,
  initializeSpringConfigFromPhysical,
} from './springConfig';

describe('createSpringConfig', () => {
  it('stores frequency and dampingRatio verbatim', () => {
    const config = createSpringConfig(2.5, 0.4);
    expect(config.frequency).toBe(2.5);
    expect(config.dampingRatio).toBe(0.4);
  });
});

describe('createSpringConfigFromPhysical', () => {
  it('maps k=100, c=20, m=1 to frequency = sqrt(k/m)/(2*PI) and dampingRatio = 1 (critical)', () => {
    const config = createSpringConfigFromPhysical(100, 20, 1);
    expect(config.frequency).toBeCloseTo(10 / TAU, 9);
    expect(config.dampingRatio).toBeCloseTo(1, 12);
  });

  it('accounts for mass in both frequency and damping ratio', () => {
    // k=100, m=4 -> sqrt(25)=5 -> frequency 5/TAU; c=20 -> 20/(2*sqrt(400))=0.5.
    const config = createSpringConfigFromPhysical(100, 20, 4);
    expect(config.frequency).toBeCloseTo(5 / TAU, 9);
    expect(config.dampingRatio).toBeCloseTo(0.5, 12);
  });
});

describe('initializeSpringConfig', () => {
  it('is the construction initializer of createSpringConfig', () => {
    expect(typeof initializeSpringConfig).toBe('function');
  });
});
describe('initializeSpringConfigFromPhysical', () => {
  it('is the construction initializer of createSpringConfigFromPhysical', () => {
    expect(typeof initializeSpringConfigFromPhysical).toBe('function');
  });
});

describe('spring presets', () => {
  it('exports frozen plain-data configs that can be customized by spreading', () => {
    expect(Object.isFrozen(SpringPresetBouncy)).toBe(true);
    expect(Object.isFrozen(SpringPresetGentle)).toBe(true);
    expect(Object.isFrozen(SpringPresetStiff)).toBe(true);
    expect(Reflect.set(SpringPresetBouncy, 'frequency', 100)).toBe(false);

    const customized = { ...SpringPresetGentle, frequency: 3 };
    expect(customized.dampingRatio).toBe(SpringPresetGentle.dampingRatio);
    expect(customized.frequency).toBe(3);
    expect(SpringPresetGentle.frequency).not.toBe(3);
  });

  it('provides distinct bouncy, gentle, and stiff response profiles', () => {
    expect(SpringPresetBouncy.dampingRatio).toBeLessThan(SpringPresetGentle.dampingRatio);
    expect(SpringPresetGentle.frequency).toBeLessThan(SpringPresetStiff.frequency);
    expect(SpringPresetStiff.dampingRatio).toBeGreaterThanOrEqual(1);
  });
});
