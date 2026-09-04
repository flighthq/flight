import { invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { bindWgpuImageResourceTexture, resolveWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { RenderProxy2D, Scene2DRenderer, Shape, WgpuRenderState } from '@flighthq/types/contract';
import { BatchFormat, RenderRegistry, ShapeKind } from '@flighthq/types/contract';

import {
  QUAD_BATCH_INSTANCE_FLOATS,
  ensureWgpuQuadBatchResources,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
} from './wgpuQuadBatchWriter';
import {
  acquireWgpuShapeRasterSurface,
  createWgpuShapeData,
  destroyWgpuShapeData,
  getWgpuShapeData,
} from './wgpuShapeData';
import { getWgpuShapeRasterizer } from './wgpuShapeRasterizer';

// Replays the shape's whole command stream into an offscreen 2D canvas and draws the result as one
// textured quad. Every command in the stream is replayed, not just the ones the mesh path could not
// express, which is why a state that can rasterize at all needs the full canvas command vocabulary
// registered rather than some subset of it. Mirrors scene2d-gl/glRasterShapeRenderer.
export function drawWgpuRasterShape(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0 || renderProxy.rendererData === null) return;

  const rasterizer = getWgpuShapeRasterizer(state);
  if (rasterizer === null) {
    runtime.registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const shapeData = getWgpuShapeData(renderProxy.rendererData);
  if (shapeData === null) return;
  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  // Sized in device pixels with the replay pre-scaled to match, exactly as the text renderers treat
  // their offscreen canvases. The quad stays in local units and samples the whole texture, so a denser
  // raster is only sharper — no geometry moves with it.
  const version = getNodeLocalContentRevision(source);
  const pixelRatio = state.pixelRatio;
  if (state.raster2DSurfaceProvider === null) return;
  const surface = acquireWgpuShapeRasterSurface(state.raster2DSurfaceProvider, shapeData);
  if (surface === null) return;
  if (
    version !== shapeData.lastContentId ||
    w !== shapeData.lastW ||
    h !== shapeData.lastH ||
    pixelRatio !== shapeData.lastPixelRatio
  ) {
    // Reassigning either surface dimension may reset its 2D context even when the value is unchanged.
    // Animated shapes invalidate their commands every frame, so resize only when their bounds change.
    const pw = Math.ceil(w * pixelRatio);
    const ph = Math.ceil(h * pixelRatio);
    if (surface.width !== pw) surface.width = pw;
    if (surface.height !== ph) surface.height = ph;
    const { context } = surface;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);
    context.clearRect(bounds.x, bounds.y, w, h);
    rasterizer(context, commands, state);
    context.setTransform(1, 0, 0, 1, 0, 0);
    // Re-read the surface dimensions and bump the resource version so the batch's version-aware cache
    // re-uploads (recreating the GPU texture, which covers a size change too).
    invalidateImageResource(surface.image);
    shapeData.lastContentId = version;
    shapeData.lastPixelRatio = pixelRatio;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureWgpuQuadBatchResources(state);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const textureEntry = bindWgpuImageResourceTexture(state, surface.image, false, true);
  if (textureEntry === null) return;
  const startInstance = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
    null,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const base = startInstance * QUAD_BATCH_INSTANCE_FLOATS;
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
  packWgpuQuadBatchMaterialInstance(state, renderProxy.materialData, startInstance);
  recordWgpuQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startInstance);
  runtime.quadBatchWriterCount++;
}

// The canvas-only shape strategy: every shape rasterizes through the registered rasterizer, and this
// module never references the tessellator — so registering this renderer instead of
// defaultWgpuShapeRenderer leaves @flighthq/path's tessellatePath and shape's region resolvers out of
// the bundle.
//
// Choosing it means the full canvas command vocabulary must be registered on this state, unconditionally:
// every shape replays its whole command stream. Pick it for exact 2D-canvas fidelity, or to avoid
// shipping a tessellator at all; pick defaultWgpuMeshShapeRenderer for the opposite trade.
export const defaultWgpuRasterShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createWgpuShapeData,
  destroyData: destroyWgpuShapeData,
  submit: drawWgpuRasterShape,
};
