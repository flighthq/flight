import type { CanvasShapeCommand } from './CanvasShapeRegistry.ts';
import type { EffectPaddingResolver } from './EffectPadding.ts';
import type { Kind } from './Entity.ts';
import type { NodeRenderer } from './NodeRenderer.ts';
import type { RenderProxy } from './RenderProxy.ts';
import type {
  ColorAdjustmentUnsupportedGuard,
  RenderRootGuard,
  RenderState,
  StrokeTessellator,
} from './RenderState.ts';

export interface RenderStateOptions {
  canvasShapeCommands?: ReadonlyMap<Kind, CanvasShapeCommand>;
  colorAdjustments?: ((state: RenderState, data: RenderProxy, parentData?: RenderProxy) => void) | null;
  colorAdjustmentUnsupportedGuard?: ColorAdjustmentUnsupportedGuard | null;
  effectPaddingResolvers?: ReadonlyMap<Kind, EffectPaddingResolver>;
  nodeRenderers?: ReadonlyMap<Kind, NodeRenderer>;
  renderRootGuard?: RenderRootGuard | null;
  strokeTessellator?: StrokeTessellator | null;
}
