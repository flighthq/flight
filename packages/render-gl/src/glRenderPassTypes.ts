import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';

import type { GlRenderState } from './glRenderStateTypes.ts';
import type { GlRenderTarget } from './glRenderTargetTypes.ts';
import type { GlContext } from './types.ts';

// An active render pass bracket opened by beginGlRenderPass. Carries the render state,
// context, and bound target for the pass lifetime. Draw functions accept the pass as
// their primary context; endGlRenderPass consumes it. Pooled per-context — the same
// handle identity may be reused across frames after end.
export interface GlRenderPass extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly gl: GlContext;
  readonly state: GlRenderState;
  readonly target: GlRenderTarget;
}
