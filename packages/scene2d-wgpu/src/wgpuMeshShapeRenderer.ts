import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { tessellatePath } from '@flighthq/path/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { getShapeFillRegions, getShapeStrokeOutlineRegions, getShapeStrokeRegions } from '@flighthq/shape/contract';
import type {
  RenderProxy2D,
  Scene2DRenderer,
  Shape,
  ShapeCommandToken,
  ShapeFillRegion,
  ShapeStrokeRegion,
  WgpuRenderState,
  WgpuShapeMesh,
} from '@flighthq/types/contract';
import { BatchFormat, RegistryEntryState, RenderRegistry, ShapeKind } from '@flighthq/types/contract';

import { createWgpuShapeData, destroyWgpuShapeData, getWgpuShapeData } from './wgpuShapeData';
import { drawWgpuShapeMeshes } from './wgpuShapeMesh';

// Draws the shape through the GPU mesh path alone, and reports whether it did. Returns false when any
// fill or stroke has no tessellated form — a gradient, a texture fill, or a closed stroke the active
// tessellator rejects — which is the signal drawWgpuShape uses to fall through to the raster strategy.
// Mirrors scene2d-gl/glMeshShapeRenderer.
export function drawWgpuMeshShape(state: WgpuRenderState, renderProxy: RenderProxy2D): boolean {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return false;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0 || renderProxy.rendererData === null) return false;

  // Compact open outlines are the default. Explicitly enabling stroke-path tessellation adds hollow
  // closed rings and pathological-geometry rejection to this state only.
  const tessellatorEntry = runtime.registries.strokeTessellator.entry;
  const strokePathTessellator = tessellatorEntry?.state === RegistryEntryState.Bound ? tessellatorEntry.value : null;
  const regions = resolveWgpuShapeMeshRegions(commands, strokePathTessellator !== null);
  if (regions === null || regions.length === 0) return false;

  const meshData = getWgpuShapeData(renderProxy.rendererData);
  if (meshData === null) return false;

  const version = getNodeLocalContentRevision(source);
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
  if (meshData.meshes === null) return false;

  drawWgpuShapeMeshes(state, renderProxy, meshData.meshes, meshData.meshBuffers);
  return true;
}

// The GPU-only shape strategy: everything is tessellated, nothing is ever rasterized, and this module
// never references the canvas replay — so registering this renderer instead of defaultWgpuShapeRenderer
// leaves @flighthq/scene2d-canvas out of the bundle entirely and needs no shape commands registered.
//
// A fill with no tessellated form does not draw. That is the deliberate consequence of choosing this
// strategy rather than a defect, so it reports the same ShapeRasterizer miss the hybrid reports when no
// rasterizer is registered: the shape needs raster and this state will not do it.
export const defaultWgpuMeshShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createWgpuShapeData,
  destroyData: destroyWgpuShapeData,
  submit(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
    if (drawWgpuMeshShape(state, renderProxy)) return;
    getWgpuRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind);
  },
};

// Resolves every solid fill and solid stroke into one fill-before-stroke source list. The default lane
// uses compact fillable open-stroke outlines; the opt-in ring lane retains styled centerlines for the
// heavier direct stroke tessellator.
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

function isShapeStrokeRegion(region: ShapeFillRegion | ShapeStrokeRegion): region is ShapeStrokeRegion {
  return 'style' in region;
}
