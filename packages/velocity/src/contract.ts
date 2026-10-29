// Generated from crates/flight-velocity/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { contributeTransformVelocity } from './transformVelocity.ts';
export {
  addVelocity,
  clampVelocity,
  cloneVelocity2d,
  copyVelocity,
  dampVelocity,
  isVelocityZero,
  lengthOfVelocity,
  lerpVelocity,
  normalizeVelocity,
  scaleVelocity,
  subtractVelocity,
  zeroVelocity,
} from './velocity2d.ts';
export type { Velocity2D } from './velocity2d.ts';
export { getVelocityReasonString, parseVelocityReason } from './velocityExplanation.ts';
export type { VelocityExplanation, VelocityReason } from './velocityExplanation.ts';
export {
  createVelocitySample,
  explainVelocitySample,
  getVelocitySampleAt,
  isVelocitySampleNonzero,
  readVelocitySample,
  writeVelocitySample,
} from './velocitySample.ts';
export type { VelocitySample } from './velocitySample.ts';
export {
  beginVelocityFrame,
  contributeVelocity,
  createVelocityField,
  ensureNodeVelocitySample,
  ensureVelocitySample,
  explainVelocity,
  findVelocitySample,
  getVelocity,
  hasVelocity,
  initializeVelocityField,
  suppressVelocity,
} from './velocityStore.ts';
export type { SourceId, VelocityField } from './velocityStore.ts';
