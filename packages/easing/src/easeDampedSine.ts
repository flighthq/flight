import type { EasingFunction } from '@flighthq/types/contract';

/**
 * The parameterized form of `easeInElastic`: a decaying sine that winds up before departing, with
 * the overshoot and wavelength stated rather than fixed.
 */
export function easeInDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSinePeriod(period);
  const phase = toDampedSinePhase(amplitude, wavelength);
  return (t) => {
    if (t === 0 || t === 1) return t;
    const time = t - 1;
    const scale = toDampedSineAmplitude(amplitude, phase, time);
    return -(scale * Math.pow(2, 10 * time) * Math.sin(((-time - phase) * TAU) / wavelength));
  };
}

/**
 * The parameterized form of `easeInOutElastic`: a decaying sine whose overshoot and wavelength the
 * caller states.
 */
export function easeInOutDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSinePeriod(period);
  const phase = toDampedSinePhase(amplitude, wavelength);
  return (t) => {
    if (t === 0 || t === 1) return t;
    const time = t * 2 - 1;
    const scale = toDampedSineAmplitude(amplitude, phase, time);
    if (time < 0) {
      return -0.5 * scale * Math.pow(2, 10 * time) * Math.sin(((-time - phase) * TAU) / wavelength);
    }
    return 0.5 * (scale * Math.pow(2, -10 * time) * Math.sin(((time - phase) * TAU) / wavelength)) + 1;
  };
}

/**
 * The parameterized form of `easeOutElastic`: a decaying sine that overshoots the target and settles
 * back onto it.
 *
 * `easeInElastic` / `easeOutElastic` / `easeInOutElastic` are this same curve with `amplitude` 1 and
 * `period` fixed at 0.4 (0.45 for the in-out). They stay the right choice when those constants suit;
 * this family exists for a source that states its own, where substituting the fixed curve would be
 * confidently wrong rather than approximately right — Rive's `ElasticInterpolator` states both.
 *
 * **`amplitude` below 1 changes the shape, not just the scale.** Under 1 the curve would no longer
 * reach its endpoint, so the amplitude is ramped in over the first quarter-wavelength instead; at 1
 * and above the phase offset absorbs it and the amplitude is constant. That is the format's own
 * construction rather than an approximation of it, and it is why `amplitude` is not simply a
 * multiplier.
 *
 * A `period` of 0 is meaningless (it divides the wave) and is read as 0.5, matching the source.
 */
export function easeOutDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSinePeriod(period);
  const phase = toDampedSinePhase(amplitude, wavelength);
  return (t) => {
    if (t === 0 || t === 1) return t;
    const scale = toDampedSineAmplitude(amplitude, phase, t);
    return scale * Math.pow(2, -10 * t) * Math.sin(((t - phase) * TAU) / wavelength) + 1;
  };
}

// Below unit amplitude the curve cannot reach its endpoint on its own, so the amplitude ramps from 1
// down to the stated value across the first quarter-wavelength; from there it is constant.
function toDampedSineAmplitude(amplitude: number, phase: number, time: number): number {
  if (amplitude >= 1) return amplitude;
  const ramp = Math.abs(phase);
  const elapsed = Math.abs(time);
  if (elapsed >= ramp) return amplitude;
  const progress = elapsed / ramp;
  return amplitude * progress + (1 - progress);
}

// The phase offset that lands the decaying sine exactly on its endpoint. Above unit amplitude the
// offset is where the wave first reaches 1/amplitude; below it, no such crossing exists and a quarter
// wavelength is used instead, which is what the ramp above then compensates for.
function toDampedSinePhase(amplitude: number, wavelength: number): number {
  if (amplitude < 1) return wavelength / 4;
  return (wavelength / TAU) * Math.asin(1 / amplitude);
}

function toDampedSinePeriod(period: number): number {
  return period === 0 ? DEFAULT_DAMPED_SINE_PERIOD : period;
}

const TAU = 2 * Math.PI;
const DEFAULT_DAMPED_SINE_PERIOD = 0.5;
