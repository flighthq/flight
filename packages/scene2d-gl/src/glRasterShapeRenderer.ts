import { invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { bindGlImageResourceTexture, resolveGlMaterialRenderer } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlRenderState, RenderProxy2D, Scene2DRenderer, Shape } from '@flighthq/types/contract';
import { BatchFormat, RenderRegistry, ShapeKind } from '@flighthq/types/contract';

import {
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
} from './glQuadBatchWriter';
import { acquireGlShapeRasterSurface, createGlShapeData, destroyGlShapeData, getGlShapeData } from './glShapeData';
import { getGlShapeRasterizer } from './glShapeRasterizer';

// Replays the shape's whole command stream into an offscreen 2D canvas and draws the result as one
// textured quad. Every command in the stream is replayed, not just the ones the mesh path could not
// express, which is why a state that can rasterize at all needs the full canvas command vocabulary
// registered rather than some subset of it.
//
// Drawing at all is the registered rasterizer's job, so an absent one is reported rather than quietly
// dropping the shape.
export function drawGlRasterShape(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0 || renderProxy.rendererData === null) return;

  const rasterizer = getGlShapeRasterizer(state);
  if (rasterizer === null) {
    runtime.registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const version = getNodeLocalContentRevision(source);
  const shapeData = getGlShapeData(renderProxy.rendererData);
  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  // The raster is the shape's own pixels, so it is sized in device pixels and the replay is pre-scaled
  // to match — the same treatment glTextLabel and glRichText give their offscreen canvases. The quad
  // below stays in local units and samples the whole texture, so a denser raster is only sharper: none
  // of the geometry, bounds, or batching moves with it. pixelRatio joins the invalidation check because
  // a state that changes it must re-rasterize at the new density.
  const pixelRatio = state.pixelRatio;
  const surface = acquireGlShapeRasterSurface(shapeData);
  if (surface === null) return;
  if (
    version !== shapeData.lastContentId ||
    w !== shapeData.lastW ||
    h !== shapeData.lastH ||
    pixelRatio !== shapeData.lastPixelRatio
  ) {
    surface.width = Math.ceil(w * pixelRatio);
    surface.height = Math.ceil(h * pixelRatio);
    const { context } = surface;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);
    context.clearRect(bounds.x, bounds.y, w, h);
    rasterizer(context, commands, state);
    context.setTransform(1, 0, 0, 1, 0, 0);
    // Re-reads the surface dimensions and bumps the resource version so the batch's version-aware cache
    // re-uploads from the updated backing store.
    invalidateImageResource(surface.image);
    shapeData.lastContentId = version;
    shapeData.lastPixelRatio = pixelRatio;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureGlQuadBatchShader(state);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const texture = bindGlImageResourceTexture(state, surface.image, null, null, true);
  const straightAlpha = runtime.context.currentTextureRealization!.straightAlpha;
  const startCount = runtime.quadBatchWriterCount;
  const base = prepareGlQuadBatchWrite(
    state,
    texture,
    straightAlpha,
    null,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = runtime.quadBatchWriterInstanceData;
  d[base] = t.a;
  d[base + 1] = t.b;
  d[base + 2] = t.c;
  d[base + 3] = t.d;
  d[base + 4] = tx;
  d[base + 5] = ty;
  d[base + 6] = w;
  d[base + 7] = h;
  d[base + 8] = 0;
  d[base + 9] = 0;
  d[base + 10] = 1;
  d[base + 11] = 1;
  d[base + 12] = renderProxy.alpha;
  packGlQuadBatchMaterialInstance(state, renderProxy.materialData, startCount);
  recordGlQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startCount);
  runtime.quadBatchWriterCount++;
}

// The canvas-only shape strategy: every shape rasterizes through the registered rasterizer, and this
// module never references the tessellator — so registering this renderer instead of defaultGlShapeRenderer
// leaves @flighthq/path's tessellatePath and shape's region resolvers out of the bundle.
//
// Choosing it means the full canvas command vocabulary must be registered on this state, unconditionally:
// every shape replays its whole command stream. Pick it for exact 2D-canvas fidelity, or to avoid
// shipping a tessellator at all; pick defaultGlMeshShapeRenderer for the opposite trade.
export const defaultGlRasterShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createGlShapeData,
  destroyData: destroyGlShapeData,
  submit: drawGlRasterShape,
};
