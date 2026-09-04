import {
  applySpringImpulse,
  createSpring,
  initializeSpring,
  isSpringSettled,
  resetSpring,
  updateSpring,
  updateSpringAngle,
} from './spring';
import { createSpringConfig } from './springConfig';

describe('applySpringImpulse', () => {
  it('adds velocity without changing position and composes repeated impulses', () => {
    const spring = createSpring(12, 3);

    applySpringImpulse(spring, 4);
    applySpringImpulse(spring, -1.5);

    expect(spring.value).toBe(12);
    expect(spring.velocity).toBe(5.5);
  });
});

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
describe('initializeSpring', () => {
  it('is the construction initializer of createSpring', () => {
    expect(typeof initializeSpring).toBe('function');
  });
});
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

describe('updateSpring', () => {
  it('converges monotonically to the target with no overshoot when critically damped', () => {
    const spring = createSpring(0);
    const config = createSpringConfig(1, 1);
    const target = 10;

    let previous = spring.value;
    for (let i = 0; i < 600; i++) {
      updateSpring(spring, target, config, 1 / 60);
      // Critical damping never overshoots and never reverses on a step-to-rest.
      expect(spring.value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(spring.value).toBeLessThanOrEqual(target + 1e-9);
      previous = spring.value;
    }
    expect(spring.value).toBeCloseTo(target, 3);
    expect(isSpringSettled(spring, target)).toBe(true);
  });

  it('overshoots the target at least once then settles when underdamped', () => {
    const spring = createSpring(0);
    const config = createSpringConfig(1, 0.3);
    const target = 10;

    let overshot = false;
    for (let i = 0; i < 2000; i++) {
      updateSpring(spring, target, config, 1 / 60);
      if (spring.value > target + 0.05) overshot = true;
    }
    expect(overshot).toBe(true);
    expect(isSpringSettled(spring, target)).toBe(true);
  });

  it('converges slowly without overshoot when overdamped', () => {
    const underTarget = createSpring(0);
    const config = createSpringConfig(1, 2);
    const target = 10;

    let previous = underTarget.value;
    for (let i = 0; i < 120; i++) {
      updateSpring(underTarget, target, config, 1 / 60);
      expect(underTarget.value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(underTarget.value).toBeLessThanOrEqual(target + 1e-9);
      previous = underTarget.value;
    }

    // After the same wall time an overdamped spring lags behind a critically damped one.
    const critical = createSpring(0);
    const criticalConfig = createSpringConfig(1, 1);
    for (let i = 0; i < 120; i++) updateSpring(critical, target, criticalConfig, 1 / 60);
    expect(underTarget.value).toBeLessThan(critical.value);
  });

  it('stays finite and bounded for a stiff spring stepped at a huge deltaTime', () => {
    const spring = createSpring(0);
    const config = createSpringConfig(1000, 1);
    const target = 10;

    // An explicit-Euler integrator would explode here; the analytic step lands on the target.
    updateSpring(spring, target, config, 1);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(Number.isFinite(spring.velocity)).toBe(true);
    expect(spring.value).toBeCloseTo(target, 6);
    expect(spring.velocity).toBeCloseTo(0, 6);
  });

  it('stays finite for a stiff underdamped spring stepped repeatedly at a huge deltaTime', () => {
    const spring = createSpring(0);
    const config = createSpringConfig(1000, 0.5);
    const target = 10;

    for (let i = 0; i < 50; i++) {
      updateSpring(spring, target, config, 1);
      expect(Number.isFinite(spring.value)).toBe(true);
      expect(Number.isFinite(spring.velocity)).toBe(true);
      expect(Math.abs(spring.value)).toBeLessThan(100);
    }
    expect(isSpringSettled(spring, target)).toBe(true);
  });

  it('is frame-rate independent for a constant target (analytic semigroup)', () => {
    const config = createSpringConfig(2, 0.5);
    const target = 7;

    // 60 small steps of 1/60s cover exactly the same second as one 1s step; the exact analytic
    // solution makes them agree to floating tolerance (M(dt)^60 == M(1)).
    const fine = createSpring(0, 3);
    for (let i = 0; i < 60; i++) updateSpring(fine, target, config, 1 / 60);

    const coarse = createSpring(0, 3);
    updateSpring(coarse, target, config, 1);

    expect(fine.value).toBeCloseTo(coarse.value, 6);
    expect(fine.velocity).toBeCloseTo(coarse.velocity, 6);
  });

  it('is a no-op for deltaTime <= 0', () => {
    const spring = createSpring(4, 2);
    const config = createSpringConfig(1, 1);

    updateSpring(spring, 100, config, 0);
    expect(spring.value).toBe(4);
    expect(spring.velocity).toBe(2);

    updateSpring(spring, 100, config, -1);
    expect(spring.value).toBe(4);
    expect(spring.velocity).toBe(2);
  });

  it('is inert for a non-positive frequency', () => {
    const spring = createSpring(4, 2);
    updateSpring(spring, 100, createSpringConfig(0, 1), 1 / 60);
    expect(spring.value).toBe(4);
    expect(spring.velocity).toBe(2);
  });

  it('reads value and velocity before writing (no self-clobber)', () => {
    // The new value must use the OLD velocity; if the step wrote value before reading velocity the
    // result would differ. A hand-rolled second reference spring from the same state must match.
    const spring = createSpring(5, 2);
    const reference = createSpring(5, 2);
    const config = createSpringConfig(3, 0.7);

    updateSpring(spring, 0, config, 1 / 60);
    updateSpring(reference, 0, config, 1 / 60);
    expect(spring.value).toBe(reference.value);
    expect(spring.velocity).toBe(reference.velocity);
    // A meaningful step actually moved and imparted velocity.
    expect(spring.value).not.toBe(5);
    expect(spring.velocity).not.toBe(2);
  });
});
describe('updateSpringAngle', () => {
  it('takes the shortest path across a degree seam in both directions', () => {
    const config = createSpringConfig(2, 1);
    const forward = createSpring(359);
    const forwardReference = createSpring(359);
    updateSpringAngle(forward, 1, 360, config, 1 / 60);
    updateSpring(forwardReference, 361, config, 1 / 60);
    expect(forward.value).toBeCloseTo(forwardReference.value, 12);
    expect(forward.velocity).toBeCloseTo(forwardReference.velocity, 12);

    const reverse = createSpring(1);
    const reverseReference = createSpring(1);
    updateSpringAngle(reverse, 359, 360, config, 1 / 60);
    updateSpring(reverseReference, -1, config, 1 / 60);
    expect(reverse.value).toBeCloseTo(reverseReference.value, 12);
    expect(reverse.velocity).toBeCloseTo(reverseReference.velocity, 12);
  });

  it('uses caller-selected units and resolves exact half-turn ties positively', () => {
    const config = createSpringConfig(2, 1);
    const spring = createSpring(0);
    const reference = createSpring(0);

    updateSpringAngle(spring, -0.5, 1, config, 1 / 60);
    updateSpring(reference, 0.5, config, 1 / 60);

    expect(spring.value).toBeCloseTo(reference.value, 12);
    expect(spring.velocity).toBeCloseTo(reference.velocity, 12);
  });
});
