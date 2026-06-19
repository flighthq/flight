import type { BlendMode } from './BlendMode';
import type { DOMStageRectangle } from './DOMStageRectangle';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState, RenderStateRuntime } from './RenderState';
import type { PathWinding } from './ShapeCommand';

export interface DOMRenderState extends RenderState {
  applyBlendMode: ((element: HTMLElement, blendMode: BlendMode | null) => void) | null;
  // Optional CSS-filter resolver. Installed by enableDOMCSSFilterSupport; null (and tree-shaken)
  // until then, keeping the binding lookup and its module out of filter-free bundles.
  domCSSFilterResolver: ((renderProxy: RenderProxy2D) => string | undefined) | null;
  readonly element: HTMLElement;
}

// Package-private DOM state for a DOMRenderState entity. Lives in the runtime tier (not on the
// entity) so the public DOMRenderState surface stays minimal; the render path resolves it each frame
// via getDOMRenderStateRuntime. Defined in @flighthq/types — the header layer — so out-of-package
// custom renderers can reach the same state.
export interface DOMRenderStateRuntime extends RenderStateRuntime {
  // Active blend mode tracked to avoid redundant DOM writes. Internal — formerly public on the
  // DOMRenderState entity.
  currentBlendMode: BlendMode | null;
  // Clip hooks: set when enableDOMClipSupport is called.
  domClipHooks: DOMClipHooks | null;
  // Clip stack shared across all clip effects (rect + path entries).
  domClipStack: DOMClipEntry[];
  // Set by each renderer via setDOMRendererElement; read by the render loop after each draw.
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

// DOM contour clip via CSS clip-path. Unlike WebGL/WebGPU stencil, the DOM realizes a path clip as a
// `clip-path` on the masked element(s). Crisp (vector), honors winding via `clip-rule`. Replaces the
// former domMask bounding-rectangle approximation for path clips.
export interface DOMClipContourEntry {
  // Contour points already transformed to stage space (apply() then maps to each element's local space).
  contours: number[][];
  kind: 'contour';
  winding: PathWinding;
}

// A clip stack entry is either a stage-space rectangle (scissor/scroll-rect clip) or a contour entry
// (path clip). applyDOMClipRectangles emits a clip-path for whichever is present; a bare
// DOMStageRectangle (no `kind` tag) is the rect case, a DOMClipContourEntry the contour case.
export type DOMClipEntry = DOMClipContourEntry | DOMStageRectangle;

// Per-element clip application hook for the DOM backend. Installed on the runtime tier by
// enableDOMClipSupport; the render loop invokes apply after each draw to emit the element's clip-path
// from the active clip stack.
export interface DOMClipHooks {
  apply(state: DOMRenderState, data: RenderProxy2D): void;
}
