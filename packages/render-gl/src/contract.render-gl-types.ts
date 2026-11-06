// Acyclic build entry selected by contract-only projects through the `.render-gl-types` module suffix.
// The published @flighthq/render-gl/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  GlCapabilities,
  GlContext,
  GlContextOptions,
  GlSurface,
  HostGlCapabilities,
  HostGlCapability,
} from './types.ts';
