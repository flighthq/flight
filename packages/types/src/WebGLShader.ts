import type { RenderProxy2D } from './RenderProxy2D';
import type { WebGLRenderState } from './WebGLRenderState';

export interface WebGLShader {
  readonly program: WebGLProgram;
  bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderProxy: RenderProxy2D): void;
}
