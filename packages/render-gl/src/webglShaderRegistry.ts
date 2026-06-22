import type { GlRenderState } from '@flighthq/types';

import { getGlRenderStateRuntime } from './webglRenderState';
import type { GlBitmapShader } from './webglShaderTypes';

export type { GlBitmapShader, GlShaderLocations } from './webglShaderTypes';

export function registerGlBitmapShader(state: GlRenderState, shader: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.defaultBitmapShader = shader;
}
