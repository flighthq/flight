import type { BatchFormat } from './BatchFormat';
import type { NodeAny } from './Node';
import type { RendererData } from './RendererData';
import type { RenderProxy } from './RenderProxy';
import type { RenderState } from './RenderState';

export interface NodeRenderer {
  // Declares which geometry accumulation pipeline this renderer submits into. When set, the
  // render walk can flush automatically on format changes instead of each immediate-draw renderer
  // flushing manually. Absent means the renderer manages its own flush boundaries.
  format?: BatchFormat;
  createData(state: RenderState, source: NodeAny): RendererData | null;
  // Frees any non-GC resource this renderer allocated into `data` (GPU textures, framebuffers).
  // Called when the proxy's renderer/data is replaced or the proxy is destroyed. Optional: renderers
  // whose data holds only GC-managed values (or none) omit it. `destroy*` semantics — frees now.
  destroyData?(state: RenderState, data: RendererData): void;
  // Kind-owned identity check reached through the already-selected renderer before a
  // requiresInvalidation prepare can skip the node. Implementations keep their comparison stamp in
  // rendererData, which is per-node and per-state; absent renderers retain the revision-only path.
  isDirty?(state: RenderState, source: NodeAny, data: RendererData | null): boolean;
  submit(state: RenderState, node: RenderProxy): void;
}
