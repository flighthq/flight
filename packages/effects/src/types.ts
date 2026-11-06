import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { RenderTargetDepth, RenderTargetFormat } from '@flighthq/render/contract';

// Open substrate-agnostic base contract for render-effect intents. The kind is both the serialized
// discriminant and the per-backend registry key; concrete effect records remain open to third parties.
export interface Effect extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: Kind;
}

// Shared offscreen target axes for Canvas, GL and WGPU effect pipelines.
export interface EffectStateOptions {
  // Depth attachment for depth-dependent effects (SSAO, DoF, fog). Default 'none'.
  depth?: RenderTargetDepth;
  // 'rgba16f' gives bloom/tone-mapping HDR headroom. Default 'rgba8'.
  format?: RenderTargetFormat;
  // MSAA on the scene target so going offscreen for effects keeps edge AA. Default 1.
  sampleCount?: number;
}
