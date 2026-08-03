import type { GlRenderState, RenderProxy2D, Scene2DRenderer } from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import { drawGlMeshShape } from './glMeshShapeRenderer';
import { drawGlRasterShape } from './glRasterShapeRenderer';
import { createGlShapeData, destroyGlShapeData } from './glShapeData';

// Tessellates what it can and rasterizes the rest: the GPU mesh path is tried first, and a shape with a
// fill that has no tessellated form — a gradient, a texture fill, a closed stroke — falls through to the
// canvas replay. Both halves cache into the same per-node renderer data, so a shape that changes between
// the two does not thrash.
export function drawGlShape(state: GlRenderState, renderProxy: RenderProxy2D): void {
  if (drawGlMeshShape(state, renderProxy)) return;
  drawGlRasterShape(state, renderProxy);
}

// The general-purpose shape strategy, and the right default for an app that does not want to reason
// about which fills tessellate. Because it may take either path, it pulls both the tessellator and the
// canvas replay into the bundle, and whether it needs shape commands registered depends on scene
// content: a scene of solid fills never rasterizes, while one gradient fill makes the full canvas
// command vocabulary a requirement.
//
// Register defaultGlMeshShapeRenderer or defaultGlRasterShapeRenderer instead to pin the strategy — each
// pays for only its own path and has a wiring requirement that does not depend on the scene.
export const defaultGlShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createGlShapeData,
  destroyData: destroyGlShapeData,
  submit: drawGlShape,
};

// MorphShape owns a distinct kind while sharing Shape's mesh/raster renderer and cache lifecycle.
export const defaultGlMorphShapeRenderer: Scene2DRenderer = defaultGlShapeRenderer;
