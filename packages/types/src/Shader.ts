import type { DisplayObjectRenderTreeNode } from './DisplayObjectRenderTreeNode';
import type { WebGLRenderState } from './WebGLRenderState';

export interface BitmapShader {
  readonly program: WebGLProgram;
  bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderNode: DisplayObjectRenderTreeNode): void;
}

export type Shader = BitmapShader;
