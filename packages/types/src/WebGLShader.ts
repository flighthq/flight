import type { RenderProxy2D } from './RenderProxy2D';
import type { GlRenderState } from './WebGLRenderState';

export interface GlShader {
  readonly program: WebGLProgram;
  bind(gl: WebGL2RenderingContext, state: GlRenderState, renderProxy: RenderProxy2D): void;
}
