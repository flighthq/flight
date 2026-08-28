import type { GlContext } from './GlContext';
import type { GlRenderState } from './GlRenderState';
import type { RenderProxy2D } from './RenderProxy2D';

export interface GlShader {
  readonly program: WebGLProgram;
  bind(gl: GlContext, state: GlRenderState, renderProxy: RenderProxy2D): void;
}
