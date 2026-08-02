import { createImageResource, invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { tessellatePath } from '@flighthq/path/contract';
import { bindWgpuImageResourceTexture, resolveWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { getShapeFillRegions, getShapeStrokeOutlineRegions, getShapeStrokeRegions } from '@flighthq/shape/contract';
import type {
  Scene2DRenderer,
  Image,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Shape,
  ShapeCommandToken,
  ShapeFillRegion,
  ShapeStrokeRegion,
  WgpuRenderState,
  WgpuShapeMeshBuffers,
} from '@flighthq/types/contract';
import { BatchFormat, RenderRegistry, ShapeKind } from '@flighthq/types/contract';
import type { WgpuShapeMesh } from '@flighthq/types/contract';

import {
  ensureWgpuQuadBatchResources,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
} from './wgpuQuadBatchWriter';
import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';
import { drawWgpuShapeMeshes } from './wgpuShapeMesh';
import { getWgpuShapeRasterizer } from './wgpuShapeRasterizer';

interface WgpuShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  // The canvas wrapped as an Image (its `source`) so the shared quad-batch writer treats a canvas-backed
  // shape uniformly with bitmaps; re-rendering bumps the version, which the batch's version-aware cache
  // re-uploads on (recreating the GPU texture, covering both content and size changes).
  image: Image;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  lastH: number;
  // GPU tessellated-mesh cache, rebuilt when the content revision changes. Null until first resolved;
  // populated only when every fill and stroke resolves to a solid mesh region, otherwise raster runs.
  meshVersion: number;
  meshes: WgpuShapeMesh[] | null;
  // Reusable per-shape GPU buffers for the mesh path, grown on demand and destroyed in destroyData.
  meshBuffers: WgpuShapeMeshBuffers;
}

function createWgpuShapeData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return createWgpuRendererData<WgpuShapeData>({
    canvas,
    ctx,
    image: createImageResource(canvas),
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
    meshBuffers: {
      vertexBuffers: [],
      vertexCapacities: [],
      indexBuffers: [],
      indexCapacities: [],
      uniformBuffers: [],
      bindGroups: [],
    },
  });
}

// Destroy the GPU texture the batch uploaded for this shape's canvas, plus the mesh path's per-shape
// vertex/index/uniform buffers, when the shape is torn down.
function destroyWgpuShapeData(state: WgpuRenderState, data: RendererData): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const shapeData = getWgpuRendererData<WgpuShapeData>(data);
  if (shapeData === null) return;
  const entry = runtime.textureSourcePremultipliedTextureCache.get(shapeData.image);
  if (entry !== undefined) {
    entry.texture.destroy();
    runtime.textureSourcePremultipliedTextureCache.delete(shapeData.image);
  }
  const b = shapeData.meshBuffers;
  for (const buffer of b.vertexBuffers) buffer.destroy();
  for (const buffer of b.indexBuffers) buffer.destroy();
  for (const buffer of b.uniformBuffers) buffer.destroy();
  b.vertexBuffers.length = 0;
  b.vertexCapacities.length = 0;
  b.indexBuffers.length = 0;
  b.indexCapacities.length = 0;
  b.uniformBuffers.length = 0;
  b.bindGroups.length = 0;
}

// Resolves every solid fill and solid stroke into one fill-before-stroke source list. The default lane
// uses compact fillable open-stroke outlines; the opt-in ring lane retains styled centerlines for the
// heavier direct stroke tessellator. Mirrors scene2d-gl/glShape.
function resolveWgpuShapeMeshRegions(
  commands: readonly ShapeCommandToken[],
  strokePathTessellatorEnabled: boolean,
): (ShapeFillRegion | ShapeStrokeRegion)[] | null {
  const fillRegions = getShapeFillRegions(commands);
  if (fillRegions === null) return null;
  const strokeRegions = strokePathTessellatorEnabled
    ? getShapeStrokeRegions(commands)
    : getShapeStrokeOutlineRegions(commands);
  if (strokeRegions === null) return null;
  const regions: (ShapeFillRegion | ShapeStrokeRegion)[] = [...fillRegions, ...strokeRegions];
  return regions.length > 0 ? regions : null;
}

export function drawWgpuShape(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // GPU mesh path: compact open outlines are the default. Explicitly enabling stroke-path
  // tessellation adds hollow closed rings and pathological-geometry rejection to this state only.
  // Mirrors scene2d-gl/glShape.
  const strokePathTessellator = runtime.strokeTessellator;
  const regions = resolveWgpuShapeMeshRegions(commands, strokePathTessellator !== null);
  if (regions !== null && regions.length > 0) {
    const meshData = getWgpuRendererData<WgpuShapeData>(renderProxy.rendererData);
    if (meshData === null) return;
    if (meshData.meshVersion !== version) {
      const meshes: WgpuShapeMesh[] = [];
      let supported = true;
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const mesh =
          strokePathTessellator !== null && isShapeStrokeRegion(region)
            ? strokePathTessellator(region.path, region.style)
            : tessellatePath(region.path);
        if (mesh === null) {
          supported = false;
          break;
        }
        meshes.push({
          vertices: new Float32Array(mesh.vertices),
          indices: new Uint16Array(mesh.indices),
          color: region.color,
          alpha: region.alpha,
        });
      }
      meshData.meshes = supported ? meshes : null;
      meshData.meshVersion = version;
    }
    if (meshData.meshes !== null) {
      drawWgpuShapeMeshes(state, renderProxy, meshData.meshes, meshData.meshBuffers);
      return;
    }
  }

  // A fill with no tessellated form is the registered rasterizer's job; an absent one is reported
  // rather than quietly dropping the fill.
  const rasterizer = getWgpuShapeRasterizer(state);
  if (rasterizer === null) {
    getWgpuRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const shapeData = getWgpuRendererData<WgpuShapeData>(renderProxy.rendererData);
  if (shapeData === null) return;
  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  // Sized in device pixels with the replay pre-scaled to match, exactly as the text renderers treat
  // their offscreen canvases. The quad stays in local units and samples the whole texture, so a denser
  // raster is only sharper — no geometry moves with it.
  const pixelRatio = state.pixelRatio;
  if (
    version !== shapeData.lastContentId ||
    w !== shapeData.lastW ||
    h !== shapeData.lastH ||
    pixelRatio !== shapeData.lastPixelRatio
  ) {
    // Reassigning either canvas dimension resets its 2D context even when the value is unchanged.
    // Animated shapes invalidate their commands every frame, so resize only when their bounds change.
    const pw = Math.ceil(w * pixelRatio);
    const ph = Math.ceil(h * pixelRatio);
    if (shapeData.canvas.width !== pw) shapeData.canvas.width = pw;
    if (shapeData.canvas.height !== ph) shapeData.canvas.height = ph;
    const ctx = shapeData.ctx;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);
    ctx.clearRect(bounds.x, bounds.y, w, h);
    rasterizer(ctx, commands, state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Re-read the canvas dimensions and bump the resource version so the batch's version-aware cache
    // re-uploads (recreating the GPU texture, which covers a size change too).
    invalidateImageResource(shapeData.image);
    shapeData.lastContentId = version;
    shapeData.lastPixelRatio = pixelRatio;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureWgpuQuadBatchResources(state);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const textureEntry = bindWgpuImageResourceTexture(state, shapeData.image, false, true);
  if (textureEntry === null) return;
  const startCount = runtime.quadBatchWriterCount;
  const base = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
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
  packWgpuQuadBatchMaterialInstance(state, renderProxy.materialData, startCount);
  recordWgpuQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startCount);
  runtime.quadBatchWriterCount++;
}

function isShapeStrokeRegion(region: ShapeFillRegion | ShapeStrokeRegion): region is ShapeStrokeRegion {
  return 'style' in region;
}

export const defaultWgpuShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createWgpuShapeData,
  destroyData: destroyWgpuShapeData,
  submit: drawWgpuShape,
};

// MorphShape owns a distinct kind while sharing Shape's mesh/raster renderer and cache lifecycle.
export const defaultWgpuMorphShapeRenderer: Scene2DRenderer = defaultWgpuShapeRenderer;
