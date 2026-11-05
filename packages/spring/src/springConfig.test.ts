// Generated from crates/flight-spring/tests/spring_config_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  SpringPresetBouncy,
  SpringPresetGentle,
  SpringPresetStiff,
  createSpringConfig,
  createSpringConfigFromPhysical,
  initializeSpringConfig,
} from './contract.ts';
import type { SpringConfig } from './contract.ts';

describe('createSpringConfig', () => {
  it('stores frequency and damping ratio verbatim', () => {
    const config = createSpringConfig(2.5, 0.4);
    expect(config.frequency).toEqual(2.5);
    expect(config.dampingRatio).toEqual(0.4);
  });
  it('stores explicit zero values', () => {
    const config = createSpringConfig(3, 0);
    expect(config.frequency).toEqual(3);
    expect(config.dampingRatio).toEqual(0);
    const zero = createSpringConfig(0, 0);
    expect(zero.frequency).toEqual(0);
    expect(zero.dampingRatio).toEqual(0);
  });
  it('bouncy preset has expected values', () => {
    expect(SpringPresetBouncy.dampingRatio).toEqual(0.35);
    expect(SpringPresetBouncy.frequency).toEqual(2);
  });
  it('gentle preset has expected values', () => {
    expect(SpringPresetGentle.dampingRatio).toEqual(0.8);
    expect(SpringPresetGentle.frequency).toEqual(1.5);
  });
  it('stiff preset has expected values', () => {
    expect(SpringPresetStiff.dampingRatio).toEqual(1);
    expect(SpringPresetStiff.frequency).toEqual(4);
  });
  it('presets can be customized by copy without changing the shared profile', () => {
    let customized = { ...SpringPresetGentle };
    customized.frequency = 3;
    expect(customized.dampingRatio).toEqual(SpringPresetGentle.dampingRatio);
    expect(customized.frequency).toEqual(3);
    expect(SpringPresetGentle.frequency).not.toEqual(3);
  });
  it('provides distinct bouncy gentle and stiff response profiles', () => {
    expect(SpringPresetBouncy.dampingRatio < SpringPresetGentle.dampingRatio).toBe(true);
    expect(SpringPresetGentle.frequency < SpringPresetStiff.frequency).toBe(true);
    expect(SpringPresetStiff.dampingRatio >= 1).toBe(true);
  });
});

describe('createSpringConfigFromPhysical', () => {
  it('maps k100 c20 m1 to critical damping', () => {
    const config = createSpringConfigFromPhysical(100, 20, 1);
    expect(config.frequency).toEqual(10 / (Math.PI * 2));
    expect(config.dampingRatio).toEqual(1);
  });
  it('accounts for mass in both frequency and damping ratio', () => {
    const config = createSpringConfigFromPhysical(100, 20, 4);
    expect(config.frequency).toEqual(5 / (Math.PI * 2));
    expect(config.dampingRatio).toEqual(0.5);
  });
});

describe('initializeSpringConfig', () => {
  it('matches create and overwrites existing values', () => {
    let out: SpringConfig = { dampingRatio: 99, frequency: 99 };
    initializeSpringConfig(out, 6, 0.75);
    const expected = createSpringConfig(6, 0.75);
    expect(out.frequency).toEqual(expected.frequency);
    expect(out.dampingRatio).toEqual(expected.dampingRatio);
  });
});
