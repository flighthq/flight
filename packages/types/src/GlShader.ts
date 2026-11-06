import type { RenderProxy2D } from '@flighthq/render/contract';

import type { GlContext } from './GlContext.ts';
import type { GlRenderState } from './GlRenderState.ts';

export interface GlShader {
  readonly program: WebGLProgram;
  bind(gl: GlContext, state: GlRenderState, renderProxy: RenderProxy2D): void;
}
