import type { GlRenderState } from './GlRenderState';
import type { RenderProxy2D } from './RenderProxy2D';

export interface GlShader {
  readonly program: WebGLProgram;
  bind(gl: WebGL2RenderingContext, state: GlRenderState, renderProxy: RenderProxy2D): void;
}
