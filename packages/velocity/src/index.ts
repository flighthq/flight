// Generated from crates/flight-velocity/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  addVelocity,
  beginVelocityFrame,
  clampVelocity,
  contributeTransformVelocity,
  contributeVelocity,
  copyVelocity,
  createVelocityField,
  dampVelocity,
  explainVelocity,
  getVelocity,
  getVelocitySampleAt,
  hasVelocity,
  isVelocityZero,
  lengthOfVelocity,
  lerpVelocity,
  normalizeVelocity,
  scaleVelocity,
  subtractVelocity,
  suppressVelocity,
  zeroVelocity,
} from './contract.ts';

export type {
  SourceId,
  Velocity2D,
  VelocityExplanation,
  VelocityField,
  VelocityReason,
  VelocitySample,
} from './contract.ts';
