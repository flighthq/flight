// Acyclic build entry selected by contract-only projects through the `.effects-types` module suffix.
// The published @flighthq/effects/contract entry remains contract.ts, which also exposes runtime helpers.
export type { BlendEffect, Effect, EffectStateOptions } from './types.ts';
export { AdvancedBlendMode } from './types.ts';
