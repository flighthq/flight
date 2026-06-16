import type { RenderNode2D } from './RenderNode2D';
import type { WebGLRenderState } from './WebGLRenderState';

export interface WebGLShader {
  readonly program: WebGLProgram;
  bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderNode: RenderNode2D): void;
}
