// Generated from crates/flight-easing/src/ease_damped_sine.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

const TAU: number = 2 * Math.PI;

const DEFAULT_DAMPED_SINE_PERIOD: number = 0.4;

/**
 * The parameterized form of `easeInElastic`: a decaying sine that winds up
 * before departing, with the overshoot and wavelength stated rather than fixed.
 */
export function easeInDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSineWavelength(period);
  const overshoot = toDampedSineOvershoot(amplitude);
  const phase = toDampedSinePhase(overshoot, wavelength);
  return (t: number): number => {
    if (t === 0 || t === 1) {
      return t;
    }
    const time = t - 1;
    return -(overshoot * Math.pow(2, 10 * time) * Math.sin(((time - phase) * TAU) / wavelength));
  };
}

/**
 * The parameterized form of `easeInOutElastic`: a decaying sine that winds
 * up, crosses, and settles, with the overshoot and wavelength stated rather
 * than fixed.
 */
export function easeInOutDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSineWavelength(period);
  const overshoot = toDampedSineOvershoot(amplitude);
  const phase = toDampedSinePhase(overshoot, wavelength);
  return (t: number): number => {
    if (t === 0 || t === 1) {
      return t;
    }
    const time = t * 2 - 1;
    if (time < 0) {
      return -0.5 * overshoot * Math.pow(2, 10 * time) * Math.sin(((time - phase) * TAU) / wavelength);
    }
    return 0.5 * overshoot * Math.pow(2, -10 * time) * Math.sin(((time - phase) * TAU) / wavelength) + 1;
  };
}

/**
 * The parameterized form of `easeOutElastic`: a decaying sine that overshoots
 * the target and settles back onto it.
 */
export function easeOutDampedSine(amplitude: number, period: number): EasingFunction {
  const wavelength = toDampedSineWavelength(period);
  const overshoot = toDampedSineOvershoot(amplitude);
  const phase = toDampedSinePhase(overshoot, wavelength);
  return (t: number): number => {
    if (t === 0 || t === 1) {
      return t;
    }
    return overshoot * Math.pow(2, -10 * t) * Math.sin(((t - phase) * TAU) / wavelength) + 1;
  };
}

function toDampedSineOvershoot(amplitude: number): number {
  if (amplitude < 1) {
    return 1;
  }
  return amplitude;
}

function toDampedSinePhase(overshoot: number, wavelength: number): number {
  return (wavelength / TAU) * Math.asin(1 / overshoot);
}

function toDampedSineWavelength(period: number): number {
  if (period > 0) {
    return period;
  }
  return DEFAULT_DAMPED_SINE_PERIOD;
}
