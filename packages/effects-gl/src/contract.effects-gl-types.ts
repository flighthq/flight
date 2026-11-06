// Acyclic build entry selected by contract-only projects through the `.effects-gl-types` module suffix.
// The published @flighthq/effects-gl/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  EffectStateOptions,
  GlCustomShaderSourceGuard,
  GlEffectApplicationExplanation,
  GlEffectApplicationGuard,
  GlEffectApplicationStatus,
  GlEffectContext,
  GlEffectRegistration,
  GlEffectResolver,
  GlEffectRunner,
  GlEffectState,
  GlEffectStateSkipGuard,
  GlColorLutTextureCache,
} from './types.ts';
