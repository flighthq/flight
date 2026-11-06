import type { GlRenderState } from './contract.render-gl-types.ts';
import type { GlBitmapShader } from './contract.render-gl-types.ts';
import { getGlRenderStateRuntime } from './glRenderState.ts';

export function registerGlBitmapShader(state: GlRenderState, shader: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.defaultBitmapShader = shader;
}
