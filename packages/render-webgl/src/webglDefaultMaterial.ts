import type { WebGLMaterialRenderer, WebGLRenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { registerWebGLMaterialRenderer } from './webglMaterialRegistry';
import {
  bindWebGLQuadBatchBaseAttributes,
  ensureWebGLQuadBatchShader,
  setWebGLQuadBatchWorldAndTexture,
  useWebGLQuadBatchProgram,
} from './webglSpriteBatch';

// Registers the bundled default material (the plain textured-quad pipeline) under DefaultMaterialKind.
// It is a bundled material like any other — it has no privileged status in the render path; a node
// with no material renders only if a renderer is registered for DefaultMaterialKind. A user can copy
// this file, swap the shader, and register their own default the same way.
export function registerDefaultWebGLMaterial(state: WebGLRenderState): void {
  registerWebGLMaterialRenderer(state, DefaultMaterialKind, defaultWebGLMaterialRenderer);
}

export const defaultWebGLMaterialRenderer: WebGLMaterialRenderer = {
  instanceFloatCount: 0,
  bind(state: WebGLRenderState): void {
    const internal = state as WebGLRenderStateInternal;
    const shader = ensureWebGLQuadBatchShader(internal);
    useWebGLQuadBatchProgram(internal, shader.program);
    setWebGLQuadBatchWorldAndTexture(internal, shader.locWorldMatrix, shader.locTexture);
    bindWebGLQuadBatchBaseAttributes(internal, shader.locCorner);
  },
};
