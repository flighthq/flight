import { describe, expect, it } from 'vitest';

import { createSpring } from './createSpring';
import { resetSpring } from './resetSpring';

describe('resetSpring', () => {
  it('snaps value and velocity, defaulting velocity to 0', () => {
    const spring = createSpring(3, 9);
    resetSpring(spring, 100);
    expect(spring.value).toBe(100);
    expect(spring.velocity).toBe(0);
  });

  it('sets an explicit velocity', () => {
    const spring = createSpring(0, 0);
    resetSpring(spring, -5, 12);
    expect(spring.value).toBe(-5);
    expect(spring.velocity).toBe(12);
  });
});
