import type { CanvasShapeCommand } from './CanvasShapeRegistry';
import type { DomTextureResolver } from './DomTextureResolver';
import type { EffectPaddingResolver } from './EffectPadding';
import type { Kind } from './Entity';
import type { NodeRenderer } from './NodeRenderer';
import type { Scene3DGraphSyncPolicy, StrokeTessellator } from './RenderState';
import type { ShapeRasterizer } from './ShapeRasterizer';
export interface DomRenderOptions {
  /**
   * Shape commands this state replays, by kind. Seeded into the runtime registries at construction.
   */
  canvasShapeCommands?: ReadonlyMap<Kind, CanvasShapeCommand>;
  /** Effect padding resolvers by kind, seeded into the runtime registries at construction. */
  effectPaddingResolvers?: ReadonlyMap<Kind, EffectPaddingResolver>;
  /**
   * Node renderers this state draws with, by kind.
   *
   * Registries are SEEDED from options rather than mutated afterwards: construction copies each table
   * into the state's own runtime, so two states built from one fragment never share a table and a
   * later registration on either cannot reach the other. Absent means the empty default, not "no
   * renderers" — the default table is preserved exactly as before this field existed.
   */
  nodeRenderers?: ReadonlyMap<Kind, NodeRenderer>;
  /**
   * Opt-in shape rasterizer. Optional but NOT nullable: absence is the only way to say "none", and it
   * preserves the constructor's existing `null` default. A second sentinel would be a distinction the
   * constructor cannot act on.
   */
  shapeRasterizer?: ShapeRasterizer;
  /** Opt-in stroke tessellator. Absent preserves the base runtime's existing default, as above. */
  strokeTessellator?: StrokeTessellator;
  /** Texture resolvers by texture-source kind, seeded into the runtime registries at construction. */
  textureResolvers?: ReadonlyMap<Kind, DomTextureResolver>;

  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
