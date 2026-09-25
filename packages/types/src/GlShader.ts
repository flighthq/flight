import type { GlContext } from './GlContext.ts';
import type { GlRenderState } from './GlRenderState.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';

export interface GlShader {
  readonly program: WebGLProgram;
  bind(gl: GlContext, state: GlRenderState, renderProxy: RenderProxy2D): void;
}
