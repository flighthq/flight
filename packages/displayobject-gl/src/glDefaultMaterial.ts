import { registerGlMaterialRenderer } from '@flighthq/render-gl';
import type { GlMaterialRenderer, GlRenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import {
  bindGlQuadBatchBaseAttributes,
  ensureGlQuadBatchShader,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glSpriteBatch';

// Registers the bundled default material (the plain textured-quad pipeline) under DefaultMaterialKind.
// It is a bundled material like any other — it has no privileged status in the render path; a node
// with no material renders only if a renderer is registered for DefaultMaterialKind. A user can copy
// this file, swap the shader, and register their own default the same way.
export function registerDefaultGlMaterial(state: GlRenderState): void {
  registerGlMaterialRenderer(state, DefaultMaterialKind, defaultGlMaterialRenderer);
}

export const defaultGlMaterialRenderer: GlMaterialRenderer = {
  instanceFloatCount: 0,
  bind(state: GlRenderState): void {
    const shader = ensureGlQuadBatchShader(state);
    useGlQuadBatchProgram(state, shader.program);
    setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture);
    bindGlQuadBatchBaseAttributes(state, shader.locCorner);
  },
};
