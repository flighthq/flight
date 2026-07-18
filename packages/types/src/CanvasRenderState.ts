import type { BlendMode } from './BlendMode';
import type { CanvasMaterialRenderer } from './CanvasMaterialRenderer';
import type { Kind } from './Entity';
import type { ImageResource } from './ImageResource';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState, RenderStateRuntime } from './RenderState';

export interface CanvasRenderState extends RenderState {
  applyBlendMode: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  // Optional CSS-filter resolver. Installed by enableCanvasCssFilter; null (and tree-shaken)
  // until then, keeping the binding lookup and its module out of filter-free bundles.
  canvasCssFilterResolver: ((state: CanvasRenderState, renderProxy: RenderProxy2D) => string | null) | null;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
}

// Package-private 2D-canvas state for a CanvasRenderState entity. Lives in the runtime tier (not on
// the entity) so the public CanvasRenderState surface stays minimal — only the canvas/context
// handles and the applyBlendMode/canvasCssFilterResolver hooks remain on the entity. The render path
// resolves this each frame via getCanvasRenderStateRuntime. Defined in @flighthq/types — the header
// layer — so out-of-package custom renderers can reach the same state.
export interface CanvasRenderStateRuntime extends RenderStateRuntime {
  // Active compositing mode tracked to avoid redundant globalCompositeOperation changes. Internal —
  // formerly public on the CanvasRenderState entity.
  currentBlendMode: BlendMode | null;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  // Per-render-state cache of the drawable HTMLCanvasElement materialized from a data-only
  // ImageResource (a generated Surface with no host `source` element), keyed on the resource and
  // re-materialized when its `version` bumps. Renderer-owned derived state — the Canvas parallel to
  // the GL backend's imageResourceTextureCache — so a data-only Surface draws with no manual element
  // sync, while element-backed resources never touch this map. Absent (and tree-shaken) until the
  // first data-only resolve; see resolveCanvasImageSource.
  imageResourceElementCache?: WeakMap<ImageResource, { element: HTMLCanvasElement; version: number }>;
  // Per-material-kind canvas renderer registry. Absent (and tree-shaken) until a material renderer
  // is registered.
  materialRendererMap?: Map<Kind, CanvasMaterialRenderer>;
}
