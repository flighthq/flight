import type { GlRenderState } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';
import type { GlBitmapShader } from './glShaderTypes';

export type { GlBitmapShader, GlShaderLocations } from './glShaderTypes';

export function registerGlBitmapShader(state: GlRenderState, shader: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.defaultBitmapShader = shader;
}
