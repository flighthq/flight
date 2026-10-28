// Generated from crates/flight-math/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { degToRad, deltaAngle, normalizeAngle, radToDeg } from './angle.ts';
export { clamp, inRange, saturate } from './clamp.ts';
export { approxEqual, approxEqualRelative, approxZero } from './comparison.ts';
export { CIRCLE_KAPPA, DEG_TO_RAD, EPSILON, HALF_PI, RAD_TO_DEG, TAU } from './constants.ts';
export { createRandomSourceFromHash, hash2D, hash3D, hashCombine, hashUint32 } from './hash.ts';
export { inverseLerp, lerp, remap, smoothStep, step } from './interpolation.ts';
export { damp, lerpAngle, moveTowards, pingPong, repeat, smootherStep } from './interpolationAdvanced.ts';
export { isPowerOfTwo, nextMultipleOf, nextPowerOfTwo, previousPowerOfTwo } from './nextPowerOfTwo.ts';
export { factorial, gcd, hypot2, isEven, isOdd, lcm } from './numberTheory.ts';
export { createRandomSource } from './random.ts';
export type { RandomSource } from './random.ts';
export {
  pick,
  randomExponential,
  randomGaussian,
  randomGaussianPair,
  randomInsideUnitDisc,
  randomInsideUnitSphere,
  randomOnUnitCircle,
  randomOnUnitSphere,
  randomPoisson,
  randomWeighted,
  shuffle,
  shuffleInPlace,
} from './randomDistributions.ts';
export { randomBool, randomInt, randomRange, randomSign } from './randomRange.ts';
export { ceilTo, euclideanMod, floorTo, fract, roundTo } from './rounding.ts';
export { ceilPowerOfTwo, floorPowerOfTwo, quantize, sign } from './scalar.ts';
export { mean, median, standardDeviation, variance, weightedAverage } from './statistics.ts';
