import type { EasingFunction } from '@flighthq/types/contract';

/**
 * The parameterized form of `easeInElastic`: a decaying sine that winds up before departing, with the
 * overshoot and wavelength stated rather than fixed.
 */
export function easeInDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSineWavelength(period);
  const overshoot = toDampedSineOvershoot(amplitude);
  const phase = toDampedSinePhase(overshoot, wavelength);
  return (t) => {
    if (t === 0 || t === 1) return t;
    const time = t - 1;
    return -(overshoot * Math.pow(2, 10 * time) * Math.sin(((time - phase) * TAU) / wavelength));
  };
}

/**
 * The parameterized form of `easeInOutElastic`: a decaying sine that winds up, crosses, and settles,
 * with the overshoot and wavelength stated rather than fixed.
 */
export function easeInOutDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSineWavelength(period);
  const overshoot = toDampedSineOvershoot(amplitude);
  const phase = toDampedSinePhase(overshoot, wavelength);
  return (t) => {
    if (t === 0 || t === 1) return t;
    const time = t * 2 - 1;
    if (time < 0) {
      return -0.5 * overshoot * Math.pow(2, 10 * time) * Math.sin(((time - phase) * TAU) / wavelength);
    }
    return 0.5 * overshoot * Math.pow(2, -10 * time) * Math.sin(((time - phase) * TAU) / wavelength) + 1;
  };
}

/**
 * The parameterized form of `easeOutElastic`: a decaying sine that overshoots the target and settles
 * back onto it.
 *
 * `easeInElastic` / `easeOutElastic` / `easeInOutElastic` are this same published curve with the two
 * parameters fixed. They stay the right choice when those constants suit; this family exists for a
 * caller that states its own — an importer whose source file names an amplitude and a period, where
 * substituting the fixed curve would be confidently wrong rather than approximately right.
 *
 * **Both degenerate cases are Flight's own choices, not anyone else's**, and both are stated here
 * because they are the only places this can differ from another implementation of the same curve:
 *
 * - **An amplitude below 1 is raised to 1.** The phase term is `asin(1 / amplitude)`, which has no real
 *   solution below unit amplitude, so the published curve is simply not defined there. Rather than
 *   invent a shape for it we take the smallest curve the form does define, which also keeps the
 *   endpoints exact. An elastic with less than unit overshoot is a contradiction in terms.
 * - **A non-positive period falls back to 0.4.** It divides the wave, so zero has no meaning. 0.4 is the
 *   constant our own `easeOutElastic` already uses, so a caller who states nothing gets the curve this
 *   package's preset would have given — the least surprising answer available, and one that keeps the
 *   two families consistent with each other.
 */
export function easeOutDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSineWavelength(period);
  const overshoot = toDampedSineOvershoot(amplitude);
  const phase = toDampedSinePhase(overshoot, wavelength);
  return (t) => {
    if (t === 0 || t === 1) return t;
    return overshoot * Math.pow(2, -10 * t) * Math.sin(((t - phase) * TAU) / wavelength) + 1;
  };
}

// Where the decaying sine crosses its endpoint, which is what makes t=0 land exactly on 0.
function toDampedSinePhase(overshoot: number, wavelength: number): number {
  return (wavelength / TAU) * Math.asin(1 / overshoot);
}

// Below unit overshoot the phase term has no real solution, so the curve is undefined rather than
// merely small. Clamping is Flight's choice: the smallest defined curve beats an invented one.
function toDampedSineOvershoot(amplitude: number): number {
  return amplitude < 1 ? 1 : amplitude;
}

// A period divides the wave, so a non-positive one is meaningless. Flight's choice is the constant its
// own fixed elastic already uses, so the two families agree with each other.
function toDampedSineWavelength(period: number): number {
  return period > 0 ? period : DEFAULT_DAMPED_SINE_PERIOD;
}

const TAU = 2 * Math.PI;
const DEFAULT_DAMPED_SINE_PERIOD = 0.4;
