import type { GlRenderState } from '@flighthq/types';
import type { GlBitmapShader } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';

export function registerGlBitmapShader(state: GlRenderState, shader: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.defaultBitmapShader = shader;
}
