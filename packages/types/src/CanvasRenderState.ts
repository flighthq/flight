import type { BlendMode } from './BlendMode';
import type { CanvasMaterialRenderer } from './CanvasMaterialRenderer';
import type { CanvasRenderEffectRunner } from './CanvasRenderEffectPipeline';
import type { CanvasRenderTarget } from './CanvasRenderTarget';
import type { CanvasTextureResolvers } from './CanvasTextureResolver';
import type { KeyedTable } from './RegistryTable';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderRegistries, RenderState, RenderStateRuntime } from './RenderState';

export interface CanvasRenderState extends RenderState {
  applyBlendMode: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  // Optional CSS-filter resolver. Installed by enableCanvasCssFilter; null (and tree-shaken)
  // until then, keeping the binding lookup and its module out of filter-free bundles.
  canvasCssFilterResolver: ((state: CanvasRenderState, renderProxy: RenderProxy2D) => string | null) | null;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
}

// Pure registration policy owned by one Canvas render pipeline. Tables are persistent: a derived
// pipeline may initially share them, while either aggregate can later replace a member independently.
export interface CanvasRenderRegistries extends RenderRegistries {
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
  // Active compositing mode tracked to avoid redundant globalCompositeOperation changes. Internal —
  // formerly public on the CanvasRenderState entity.
  currentBlendMode: BlendMode | null;
  // The state's own texture-resolution set, created with the state and wired to its miss emitter. It is
  // a separate primitive so a shape rasterizer on another backend can share it — see CanvasTextureResolvers.
  canvasTextureResolvers: CanvasTextureResolvers;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  // Backdrop targets a BlendEffect can name through its `backdropKey`, so the advanced-blend recipe can
  // read a layer it did not produce. The registry holds the target only and never owns or frees it.
  // Absent until a backdrop is registered, so a scene using no advanced blend carries no map.
  canvasBlendEffectBackdrops?: Map<string, CanvasRenderTarget>;
}
