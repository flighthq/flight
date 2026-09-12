import type { Entity } from './Entity';
import type { GlContext } from './GlContext';
import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget } from './GlRenderTarget';

// An active render pass bracket opened by beginGlRenderPass. Carries the render state,
// context, and bound target for the pass lifetime. Draw functions accept the pass as
// their primary context; endGlRenderPass consumes it. Pooled per-context — the same
// handle identity may be reused across frames after end.
export interface GlRenderPass extends Entity {
  readonly gl: GlContext;
  readonly state: GlRenderState;
  readonly target: GlRenderTarget;
}
