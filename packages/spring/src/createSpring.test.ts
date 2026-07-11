import { describe, expect, it } from 'vitest';

import { createSpring } from './createSpring';

describe('createSpring', () => {
  it('defaults value and velocity to 0', () => {
    const spring = createSpring();
    expect(spring.value).toBe(0);
    expect(spring.velocity).toBe(0);
  });

  it('sets the provided value and velocity', () => {
    const spring = createSpring(5, -2);
    expect(spring.value).toBe(5);
    expect(spring.velocity).toBe(-2);
  });
});
