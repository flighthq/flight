import type { CanvasShapeCommand } from './CanvasShapeRegistry';
import type { EffectPaddingResolver } from './EffectPadding';
import type { Kind } from './Entity';
import type { NodeRenderer } from './NodeRenderer';
import type { RenderProxy } from './RenderProxy';
import type { ColorAdjustmentUnsupportedGuard, RenderRootGuard, RenderState, StrokeTessellator } from './RenderState';

export interface RenderStateOptions {
  canvasShapeCommands?: ReadonlyMap<Kind, CanvasShapeCommand>;
  colorAdjustments?: ((state: RenderState, data: RenderProxy, parentData?: RenderProxy) => void) | null;
  colorAdjustmentUnsupportedGuard?: ColorAdjustmentUnsupportedGuard | null;
  effectPaddingResolvers?: ReadonlyMap<Kind, EffectPaddingResolver>;
  nodeRenderers?: ReadonlyMap<Kind, NodeRenderer>;
  renderRootGuard?: RenderRootGuard | null;
  strokeTessellator?: StrokeTessellator | null;
}
