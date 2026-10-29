// Acyclic build entry selected by contract-only projects through the `.velocity-types` module suffix.
// The published @flighthq/velocity/contract entry remains contract.ts, which adds the runtime barrel.
export type { Velocity2D } from './velocity2d.ts';
export type { VelocityExplanation, VelocityReason } from './velocityExplanation.ts';
export type { VelocitySample } from './velocitySample.ts';
export type { SourceId, VelocityField } from './velocityStore.ts';
