import { registerGlQuadMaterialRenderer } from '@flighthq/render-gl/contract';
import type { GlQuadMaterialRenderer, GlRenderState } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import {
  bindGlQuadBatchBaseAttributes,
  ensureGlQuadBatchShader,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glQuadBatchWriter';

// Registers the bundled default material (the plain textured-quad pipeline) under StandardMaterialKind.
// It is a bundled material like any other — it has no privileged status in the render path; a node
// with no material renders only if a renderer is registered for StandardMaterialKind. A user can copy
// this file, swap the shader, and register their own default the same way.
export function registerGlStandardMaterial(state: GlRenderState): void {
  registerGlQuadMaterialRenderer(state, StandardMaterialKind, standardGlQuadMaterialRenderer);
}

export const standardGlQuadMaterialRenderer: GlQuadMaterialRenderer = {
  instanceFloatCount: 0,
  bind(state: GlRenderState): void {
    const shader = ensureGlQuadBatchShader(state);
    useGlQuadBatchProgram(state, shader.program);
    setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);
    bindGlQuadBatchBaseAttributes(state, shader.locCorner);
  },
};
