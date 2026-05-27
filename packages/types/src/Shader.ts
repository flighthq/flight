import type { DisplayObjectRenderNode } from './DisplayObjectRenderNode';
import type { WebGLRenderState } from './WebGLRenderState';

export interface BitmapShader {
  readonly program: WebGLProgram;
  bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderNode: DisplayObjectRenderNode): void;
}

export type Shader = BitmapShader;
