import { describe, expect, it } from 'vitest';

import { createSpring } from './createSpring';
import { isSpringSettled } from './isSpringSettled';
import { createSpringConfig } from './springConfig';
import { updateSpring } from './updateSpring';

describe('isSpringSettled', () => {
  it('is false while the spring is still moving toward the target', () => {
    const spring = createSpring(0);
    const config = createSpringConfig(1, 1);
    updateSpring(spring, 10, config, 1 / 60);
    expect(isSpringSettled(spring, 10)).toBe(false);
  });

  it('is true once the spring rests at the target', () => {
    const spring = createSpring(0);
    const config = createSpringConfig(4, 1);
    for (let i = 0; i < 600; i++) updateSpring(spring, 10, config, 1 / 60);
    expect(isSpringSettled(spring, 10)).toBe(true);
  });

  it('is false at the target when velocity is still high (mid overshoot)', () => {
    // At the target position but moving fast is not settled.
    const spring = createSpring(10, 50);
    expect(isSpringSettled(spring, 10)).toBe(false);
  });

  it('is false when at rest but away from the target', () => {
    const spring = createSpring(3, 0);
    expect(isSpringSettled(spring, 10)).toBe(false);
  });

  it('honors custom epsilons', () => {
    const spring = createSpring(10.4, 0.4);
    expect(isSpringSettled(spring, 10)).toBe(false);
    expect(isSpringSettled(spring, 10, 0.5, 0.5)).toBe(true);
  });
});
