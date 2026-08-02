import { createImageResource, invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { tessellatePath } from '@flighthq/path/contract';
import { bindGlImageResourceTexture, resolveGlMaterialRenderer } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { getShapeFillRegions, getShapeStrokeOutlineRegions, getShapeStrokeRegions } from '@flighthq/shape/contract';
import type {
  Scene2DRenderer,
  GlRenderState,
  GlShapeMesh,
  Image,
  Renderable,
  RendererData,
  RenderProxy2D,
  Shape,
  ShapeCommandToken,
  ShapeFillRegion,
  ShapeStrokeRegion,
} from '@flighthq/types/contract';
import { BatchFormat, RenderRegistry, ShapeKind } from '@flighthq/types/contract';

import {
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
} from './glQuadBatchWriter';
import { drawGlShapeMeshes } from './glShapeMesh';
import { getGlShapeRasterizer } from './glShapeRasterizer';

// Renderer-private scratch state stored in the opaque RendererData slot. It is not an Entity (it
// carries no EntityRuntimeKey), so the slot is read and written through the typed accessor pair
// below — getGlShapeData / toGlShapeRendererData — which confine the single unavoidable cast to one
// named site instead of scattering it at every callsite.
interface GlShapeData {
  // The rasterization surface, allocated on the first shape that actually needs it. A shape whose fills
  // all tessellate never touches this, so a scene of solid shapes carries no canvases at all.
  surface: GlShapeRasterSurface | null;
  lastContentId: number;
  lastPixelRatio: number;
  lastW: number;
  lastH: number;
  // GPU tessellated-fill cache, rebuilt when the content revision changes. Null until first resolved;
  // populated only when every fill and stroke resolves to a solid mesh region, otherwise raster runs.
  meshVersion: number;
  meshes: GlShapeMesh[] | null;
}

interface GlShapeRasterSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: Image;
}

// Resolves every solid fill and solid stroke into one fill-before-stroke source list. The default lane
// uses compact fillable open-stroke outlines; the opt-in ring lane retains styled centerlines for the
// heavier direct stroke tessellator.
function resolveGlShapeMeshRegions(
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

function getGlShapeData(data: RendererData): GlShapeData {
  return data as unknown as GlShapeData;
}

function toGlShapeRendererData(data: GlShapeData): RendererData {
  return data as unknown as RendererData;
}

// Allocates the rasterization surface on first use. The canvas wrapped as an Image (its `source`) is
// what lets the shared quad-batch writer treat a canvas-backed shape uniformly with bitmaps and atlases;
// re-rendering the canvas bumps the resource's version (invalidateImageResource), which the batch's
// version-aware cache uses to re-upload.
function acquireGlShapeRasterSurface(data: GlShapeData): GlShapeRasterSurface {
  const existing = data.surface;
  if (existing !== null) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const surface: GlShapeRasterSurface = {
    canvas,
    ctx: canvas.getContext('2d')!,
    image: createImageResource(canvas),
  };
  data.surface = surface;
  return surface;
}

function createGlShapeData(_state: GlRenderState, _source: Renderable): RendererData | null {
  return toGlShapeRendererData({
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
  });
}

// The batch uploads this shape's canvas-backed resource into the shared cache; free that GPU texture when
// the shape is torn down so it does not leak past the resource it was keyed on. A shape that only ever
// tessellated has no surface and so no texture to free.
function destroyGlShapeData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const surface = getGlShapeData(data).surface;
  if (surface === null) return;
  const entry = runtime.textureSourcePremultipliedTextureCache.get(surface.image);
  if (entry !== undefined) {
    state.gl.deleteTexture(entry.texture);
    runtime.textureSourcePremultipliedTextureCache.delete(surface.image);
  }
}

export function drawGlShape(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // GPU mesh path: compact open outlines are the default. Explicitly enabling stroke-path
  // tessellation adds hollow closed rings and pathological-geometry rejection to this state only.
  const strokePathTessellator = runtime.strokeTessellator;
  const regions = resolveGlShapeMeshRegions(commands, strokePathTessellator !== null);
  if (regions !== null && regions.length > 0) {
    const meshData = getGlShapeData(renderProxy.rendererData);
    if (meshData.meshVersion !== version) {
      const meshes: GlShapeMesh[] = [];
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
      drawGlShapeMeshes(state, renderProxy, meshData.meshes);
      return;
    }
  }

  // Past this point the shape has a fill with no tessellated form. Drawing it at all is the registered
  // rasterizer's job, so an absent one is reported rather than quietly dropping the fill.
  const rasterizer = getGlShapeRasterizer(state);
  if (rasterizer === null) {
    runtime.registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;

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
  if (
    version !== shapeData.lastContentId ||
    w !== shapeData.lastW ||
    h !== shapeData.lastH ||
    pixelRatio !== shapeData.lastPixelRatio
  ) {
    const { canvas, ctx } = surface;
    canvas.width = Math.ceil(w * pixelRatio);
    canvas.height = Math.ceil(h * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);
    ctx.clearRect(bounds.x, bounds.y, w, h);
    rasterizer(ctx, commands, state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Re-reads the canvas dimensions and bumps the resource version so the batch's version-aware cache
    // re-uploads from the updated canvas.
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
  const straightAlpha = runtime.currentTextureStraightAlpha;
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

function isShapeStrokeRegion(region: ShapeFillRegion | ShapeStrokeRegion): region is ShapeStrokeRegion {
  return 'style' in region;
}

export const defaultGlShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createGlShapeData,
  destroyData: destroyGlShapeData,
  submit: drawGlShape,
};
