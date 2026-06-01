import type { WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import type { WebGLBitmapShader } from './webglShaderTypes';

export type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

export function registerWebGLBitmapShader(state: WebGLRenderState, shader: WebGLBitmapShader): void {
  const internal = state as WebGLRenderStateInternal;
  internal.defaultBitmapShader = shader;
}
