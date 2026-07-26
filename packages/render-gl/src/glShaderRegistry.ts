import type { GlRenderState } from '@flighthq/types/contract';
import type { GlBitmapShader } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

export function registerGlBitmapShader(state: GlRenderState, shader: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.defaultBitmapShader = shader;
}
