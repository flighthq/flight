import type { BlendMode } from './BlendMode';
import type { DomStageRectangle } from './DOMStageRectangle';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState, RenderStateRuntime } from './RenderState';
import type { PathWinding } from './ShapeCommand';

export interface DomRenderState extends RenderState {
  applyBlendMode: ((element: HTMLElement, blendMode: BlendMode | null) => void) | null;
  // Optional CSS-filter resolver. Installed by enableDomCssFilterSupport; null (and tree-shaken)
  // until then, keeping the binding lookup and its module out of filter-free bundles.
  domCssFilterResolver: ((renderProxy: RenderProxy2D) => string | undefined) | null;
  readonly element: HTMLElement;
}

// Package-private DOM state for a DomRenderState entity. Lives in the runtime tier (not on the
// entity) so the public DomRenderState surface stays minimal; the render path resolves it each frame
// via getDomRenderStateRuntime. Defined in @flighthq/types — the header layer — so out-of-package
// custom renderers can reach the same state.
export interface DomRenderStateRuntime extends RenderStateRuntime {
  // Active blend mode tracked to avoid redundant DOM writes. Internal — formerly public on the
  // DomRenderState entity.
  currentBlendMode: BlendMode | null;
  // Clip hooks: set when enableDomClipSupport is called.
  domClipHooks: DomClipHooks | null;
  // Clip stack shared across all clip effects (rect + path entries).
  domClipStack: DomClipEntry[];
  // Set by each renderer via setDomRendererElement; read by the render loop after each draw.
  domCurrentElement: HTMLElement | null;
  // WeakMap from render node to its current DOM element; survives frame boundaries.
  domElementMap: WeakMap<RenderProxy2D, HTMLElement>;
  // Ping-pong order lists: domOrderList holds the previous frame's order so the next frame can detect
  // structure changes; domNextOrderList is the scratch buffer built during the current frame. They
  // swap at the end of each render call.
  domNextOrderList: RenderProxy2D[];
  domOrderLength: number;
  domOrderList: RenderProxy2D[];
}

// DOM contour clip via CSS clip-path. Unlike Gl/Wgpu stencil, the DOM realizes a path clip as a
// `clip-path` on the masked element(s). Crisp (vector), honors winding via `clip-rule`. Replaces the
// former domMask bounding-rectangle approximation for path clips.
export interface DomClipContourEntry {
  // Contour points already transformed to stage space (apply() then maps to each element's local space).
  contours: number[][];
  kind: 'contour';
  winding: PathWinding;
}

// A clip stack entry is either a stage-space rectangle (scissor/scroll-rect clip) or a contour entry
// (path clip). applyDomClipRectangles emits a clip-path for whichever is present; a bare
// DomStageRectangle (no `kind` tag) is the rect case, a DomClipContourEntry the contour case.
export type DomClipEntry = DomClipContourEntry | DomStageRectangle;

// Per-element clip application hook for the DOM backend. Installed on the runtime tier by
// enableDomClipSupport; the render loop invokes apply after each draw to emit the element's clip-path
// from the active clip stack.
export interface DomClipHooks {
  apply(state: DomRenderState, data: RenderProxy2D): void;
}
