import type { CanvasRenderState } from './CanvasRenderState';
import type { CanvasRenderTarget } from './CanvasRenderTarget';
import type { ColorLutCache } from './ColorLutCache';
import type { RenderEffectPipelineOptions } from './GlRenderEffectPipeline';
import type { RenderEffect } from './RenderEffect';

// What a Canvas 2D effect runner is handed: the state, the offscreen scene canvas it reads, the
// offscreen canvas it writes, and a scratch pool it borrows intermediate canvases from. `source` and
// `dest` are distinct offscreen CanvasRenderTargets the pipeline ping-pongs between stages. Unlike the
// Gl context there are no depth/velocity G-buffer attachments: Canvas 2D produces only color, so
// depth-, velocity-, and HDR-dependent effects have no realization here and ship as passthrough copies.
// A runner reads `source.context` (or `source.canvas` as a CanvasImageSource) and draws into
// `dest.context`; multi-pass recipes acquire and release additional canvases from `pool`.
export interface CanvasRenderEffectContext {
  readonly state: CanvasRenderState;
  readonly source: Readonly<CanvasRenderTarget>;
  readonly dest: Readonly<CanvasRenderTarget>;
  readonly pool: CanvasRenderTargetPool;
}

// The Canvas 2D realization registered against an effect `type`. A single function over offscreen
// canvases — not a multi-method per-node renderer. The built-ins are exported as `default*` named
// constants (e.g. defaultCanvasBloomEffectRunner); register an alternative under the same key to swap
// algorithms.
export type CanvasRenderEffectRunner = (
  ctx: Readonly<CanvasRenderEffectContext>,
  effect: Readonly<RenderEffect>,
) => void;

// A reusable pool of offscreen CanvasRenderTargets. Multi-pass effect recipes (bloom) acquire scratch
// canvases for branch/blur stages and release them when done — the Canvas analog of the Gl render
// target pool. Each acquire returns a canvas sized to the requested descriptor; each must be matched by
// a release so the canvas can be reused next frame without reallocating.
export interface CanvasRenderTargetPool {
  free: CanvasRenderTarget[];
  inUse: CanvasRenderTarget[];
}

// Retains the offscreen canvases an effect pass needs across frames: the scene target the pipeline
// renders into and the intermediate-target pool. The per-frame effect list is data passed to
// endCanvasRenderEffectPipeline, not retained here. `options.sampleCount`, `format`, and `depth` are
// accepted for parity with the Gl pipeline but have no Canvas 2D realization and are ignored.
export interface CanvasRenderEffectPipeline {
  readonly options: Readonly<RenderEffectPipelineOptions>;
  sceneTarget: CanvasRenderTarget | null;
  readonly pool: CanvasRenderTargetPool;
  // Bake memo for the fused LUT-tier adjustment run, so a static grade does not re-bake its size³ cells
  // every frame. GC-managed; Canvas has no GPU upload (its per-pixel CPU lookup is inherent).
  readonly lutCache: ColorLutCache;
}
