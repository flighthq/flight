import { describe, expect, it } from 'vitest';

import { writePhysics2DSoftRowParameters } from './jointRows';

const TAU = 2 * Math.PI;

// What a correct derivation must produce, written independently of the implementation from the two
// definitions it is built on: critical damping is `2 * m * zeta * omega`, spring rate is `m * omega^2`.
function expectedSoftRow(mass: number, frequencyHz: number, dampingRatio: number, dt: number): number[] {
  const omega = TAU * frequencyHz;
  const damping = 2 * mass * dampingRatio * omega;
  const stiffness = mass * omega * omega;
  const gamma = 1 / (dt * (damping + dt * stiffness));
  return [1 / (1 / mass + gamma), dt * stiffness * gamma, gamma];
}

describe('writePhysics2DSoftRowParameters', () => {
  it('returns the hard parameters unchanged when no frequency was authored', () => {
    const out = [9, 9, 9];
    writePhysics2DSoftRowParameters(4, 0, 0.7, 1 / 60, 12, out);
    expect(out).toEqual([4, 12, 0]);
  });

  it('returns the hard parameters unchanged for a negative or NaN frequency', () => {
    const out = [9, 9, 9];
    writePhysics2DSoftRowParameters(4, -3, 0.7, 1 / 60, 12, out);
    expect(out).toEqual([4, 12, 0]);
    writePhysics2DSoftRowParameters(4, Number.NaN, 0.7, 1 / 60, 12, out);
    expect(out).toEqual([4, 12, 0]);
  });

  it('returns the hard parameters unchanged for a non-positive timestep', () => {
    // A step of no duration cannot express a rate, so the spring degrades to the stop it replaced
    // rather than to a row that silently does nothing.
    const out = [9, 9, 9];
    writePhysics2DSoftRowParameters(4, 2, 0.7, 0, 12, out);
    expect(out).toEqual([4, 12, 0]);
  });

  it('matches the stiffness-and-damping derivation it stands for', () => {
    const out = [0, 0, 0];
    writePhysics2DSoftRowParameters(2.5, 3, 0.4, 1 / 120, 0, out);
    const expected = expectedSoftRow(2.5, 3, 0.4, 1 / 120);
    expect(out[0]).toBeCloseTo(expected[0], 12);
    expect(out[1]).toBeCloseTo(expected[1], 12);
    expect(out[2]).toBeCloseTo(expected[2], 12);
  });

  it('produces a bias factor that does not depend on the mass being moved', () => {
    // The defect this function exists to prevent is invisible here and only here: mass cancels out of
    // the bias factor entirely, so an implementation fed an INVERSE mass by mistake still authors the
    // right-looking frequency and gets the damping and the softness wrong instead.
    const light = [0, 0, 0];
    const heavy = [0, 0, 0];
    writePhysics2DSoftRowParameters(0.25, 2, 0.3, 1 / 60, 0, light);
    writePhysics2DSoftRowParameters(400, 2, 0.3, 1 / 60, 0, heavy);
    expect(light[1]).toBeCloseTo(heavy[1], 12);

    // The closed form the two must agree on, with no mass in it at all.
    const omega = TAU * 2;
    expect(light[1]).toBeCloseTo((omega * omega) / (2 * 0.3 * omega + (omega * omega) / 60), 12);
  });

  it('scales gamma and the softened mass with the mass, which the bias factor hides', () => {
    // The other two outputs are where a mass-versus-inverse-mass mix-up actually shows, and they move
    // in opposite directions: compliance falls as mass rises, softened mass rises with it.
    const light = [0, 0, 0];
    const heavy = [0, 0, 0];
    writePhysics2DSoftRowParameters(1, 2, 0.3, 1 / 60, 0, light);
    writePhysics2DSoftRowParameters(4, 2, 0.3, 1 / 60, 0, heavy);
    expect(heavy[2]).toBeCloseTo(light[2] / 4, 12);
    expect(heavy[0]).toBeGreaterThan(light[0]);
  });

  it('softens rather than stiffens, since compliance adds to the inverse mass', () => {
    const out = [0, 0, 0];
    writePhysics2DSoftRowParameters(5, 1.5, 0.5, 1 / 60, 0, out);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(5);
    expect(out[2]).toBeGreaterThan(0);
  });

  it('yields a fully compliant row for a massless constraint instead of dividing by zero', () => {
    const out = [9, 9, 9];
    writePhysics2DSoftRowParameters(0, 2, 0.3, 1 / 60, 7, out);
    expect(out).toEqual([0, 0, 0]);
  });

  it('overwrites every slot of a reused out array', () => {
    // Callers keep one scratch triple for every joint prepared in a step, so a slot left behind from
    // the previous joint would be read as this one's.
    const out = [0, 0, 0];
    writePhysics2DSoftRowParameters(3, 4, 0.6, 1 / 60, 0, out);
    const soft = [...out];
    writePhysics2DSoftRowParameters(3, 0, 0.6, 1 / 60, 11, out);
    expect(out).toEqual([3, 11, 0]);
    expect(soft[2]).toBeGreaterThan(0);
  });
});
