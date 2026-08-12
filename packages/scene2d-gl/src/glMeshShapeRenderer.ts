import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { tessellatePath } from '@flighthq/path/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { getShapeFillRegions, getShapeStrokeOutlineRegions, getShapeStrokeRegions } from '@flighthq/shape/contract';
import type {
  GlRenderState,
  GlShapeMesh,
  RenderProxy2D,
  Scene2DRenderer,
  Shape,
  ShapeCommandToken,
  ShapeFillRegion,
  ShapeStrokeRegion,
} from '@flighthq/types/contract';
import { BatchFormat, RegistryEntryState, RenderRegistry, ShapeKind } from '@flighthq/types/contract';

import { createGlShapeData, destroyGlShapeData, getGlShapeData } from './glShapeData';
import { drawGlShapeMeshes } from './glShapeMesh';

// Draws the shape through the GPU mesh path alone, and reports whether it did. Returns false when any
// fill or stroke has no tessellated form — a gradient, a texture fill, or a closed stroke the active
// tessellator rejects — which is the signal drawGlShape uses to fall through to the raster strategy.
//
// Resolution-independent: the meshes are cached against the node's content revision and drawn crisp at
// any zoom, so nothing here allocates a canvas or depends on pixelRatio.
export function drawGlMeshShape(state: GlRenderState, renderProxy: RenderProxy2D): boolean {
  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0 || renderProxy.rendererData === null) return false;

  // Compact open outlines are the default. Explicitly enabling stroke-path tessellation adds hollow
  // closed rings and pathological-geometry rejection to this state only.
  const tessellatorEntry = getGlRenderStateRuntime(state).registries.strokeTessellator.entry;
  const strokePathTessellator = tessellatorEntry?.state === RegistryEntryState.Bound ? tessellatorEntry.value : null;
  const regions = resolveGlShapeMeshRegions(commands, strokePathTessellator !== null);
  if (regions === null || regions.length === 0) return false;

  const version = getNodeLocalContentRevision(source);
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
  if (meshData.meshes === null) return false;

  drawGlShapeMeshes(state, renderProxy, meshData.meshes);
  return true;
}

// The GPU-only shape strategy: everything is tessellated, nothing is ever rasterized, and this module
// never references the canvas replay — so registering this renderer instead of defaultGlShapeRenderer
// leaves @flighthq/scene2d-canvas out of the bundle entirely and needs no shape commands registered.
//
// A fill with no tessellated form does not draw. That is the deliberate consequence of choosing this
// strategy rather than a defect, so it reports the same ShapeRasterizer miss the hybrid reports when no
// rasterizer is registered: the shape needs raster and this state will not do it.
export const defaultGlMeshShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createGlShapeData,
  destroyData: destroyGlShapeData,
  submit(state: GlRenderState, renderProxy: RenderProxy2D): void {
    if (drawGlMeshShape(state, renderProxy)) return;
    getGlRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind);
  },
};

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

function isShapeStrokeRegion(region: ShapeFillRegion | ShapeStrokeRegion): region is ShapeStrokeRegion {
  return 'style' in region;
}
