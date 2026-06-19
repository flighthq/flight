import type { WebGLRenderState } from '@flighthq/types';

import { getWebGLRenderStateRuntime } from './webglRenderState';
import type { WebGLBitmapShader } from './webglShaderTypes';

export type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

export function registerWebGLBitmapShader(state: WebGLRenderState, shader: WebGLBitmapShader): void {
  const runtime = getWebGLRenderStateRuntime(state);
  runtime.defaultBitmapShader = shader;
}
