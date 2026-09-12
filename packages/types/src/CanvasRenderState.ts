import type { BlendMode } from './BlendMode';
import type { CanvasMaterialRenderer } from './CanvasMaterialRenderer';
import type { CanvasPipeline } from './CanvasPipeline';
import type { CanvasRenderEffectRunner } from './CanvasRenderEffectPipeline';
import type { CanvasRenderPass } from './CanvasRenderPass';
import type { CanvasRenderSurfaceCreator } from './CanvasRenderSurface';
import type { CanvasRenderTarget, CanvasTextureRenderTarget } from './CanvasRenderTarget';
import type { CanvasTextureResolvers } from './CanvasTextureResolver';
import type { Entity } from './Entity';
import type { KeyedTable } from './RegistryTable';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderRegistries, RenderState, RenderStateRuntime } from './RenderState';

export interface CanvasRenderState extends RenderState {
  applyBlendMode: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  // Optional CSS-filter resolver. Installed by enableCanvasCssFilter; null (and tree-shaken)
  // until then, keeping the binding lookup and its module out of filter-free bundles.
  canvasCssFilterResolver: ((state: CanvasRenderState, renderProxy: RenderProxy2D) => string | null) | null;
  // The canvas and context of the pass currently open, installed by beginCanvasRenderPass and restored
  // by its end. They are NOT construction inputs: a state is "how to draw", a target is "where", and on
  // this backend "where" is literally a different context object, which is why binding a target swaps
  // them. Mutable for that reason, and typed non-null because every draw runs inside a pass — drawing
  // outside one is API misuse, exactly as it is on GL and WGPU.
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  readonly pipeline: Readonly<CanvasPipeline>;
}

// Pure registration policy owned by one Canvas render pipeline. Tables are persistent: a derived
// pipeline may initially share them, while either aggregate can later replace a member independently.
export interface CanvasRenderRegistries extends Entity, RenderRegistries {
  // Immutable blend-mode application policy. Canvas natively supports all blend modes via
  // globalCompositeOperation — no realization table needed. The pipeline carries this function so a
  // state constructed from a pipeline receives blend support without a separate enableCanvasBlendMode
  // mutation call. Absent means blend modes are not applied (passthrough).
  blendModeApplication?: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  // Absent until the first material registration so a Canvas-only application that uses no material
  // policy retains neither the table metadata nor the declarative renderer module.
  materialRenderers?: KeyedTable<CanvasMaterialRenderer>;
  renderEffects: KeyedTable<CanvasRenderEffectRunner>;
}

// Package-private 2D-canvas state for a CanvasRenderState entity. Lives in the runtime tier (not on
// the entity) so the public CanvasRenderState surface stays minimal — only the canvas/context
// handles and the applyBlendMode/canvasCssFilterResolver hooks remain on the entity. The render path
// resolves this each frame via getCanvasRenderStateRuntime. Defined in @flighthq/types — the header
// layer — so out-of-package custom renderers can reach the same state.
export interface CanvasRenderStateRuntime extends RenderStateRuntime {
  registries: CanvasRenderRegistries;
  // Open passes, innermost last. A pass is pushed by beginCanvasRenderPass and popped by
  // endCanvasRenderPass, which restores the canvas and context the enclosing one was drawing through.
  passStack: CanvasRenderPass[];
  // The target bound by the innermost open pass; null outside any pass.
  currentRenderTarget: CanvasRenderTarget | null;
  // Active alpha tracked to avoid redundant globalAlpha changes. NaN forces a write on the first draw.
  currentAlpha: number;
  // Active compositing mode tracked to avoid redundant globalCompositeOperation changes. Internal —
  // formerly public on the CanvasRenderState entity.
  currentBlendMode: BlendMode | null;
  // The state's own texture-resolution set, created with the state and wired to its miss emitter. It is
  // a separate primitive so a shape rasterizer on another backend can share it — see CanvasTextureResolvers.
  canvasTextureResolvers: CanvasTextureResolvers;
  // The host seam this state allocates offscreen canvases through — render-cache targets, render
  // textures — installed by registerCanvasSurfaceCreator. The state owns no surface of its own, so the
  // one thing offscreen work needs from the host is named once rather than passed on every call.
  // Absent until registered, so a state that only ever draws to the screen carries no creator.
  canvasSurfaceCreator?: Readonly<CanvasRenderSurfaceCreator>;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  teardowns: ((state: CanvasRenderState) => void)[];
  // Backdrop targets a BlendEffect can name through its `backdropKey`, so the advanced-blend recipe can
  // read a layer it did not produce. The registry holds the target only and never owns or frees it.
  // Absent until a backdrop is registered, so a scene using no advanced blend carries no map.
  canvasBlendEffectBackdrops?: Map<string, CanvasTextureRenderTarget>;
}
