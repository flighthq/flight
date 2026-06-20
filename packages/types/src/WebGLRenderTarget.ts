import type { RenderTargetFormat } from './RenderTarget';

// WebGL realization of a RenderTargetDescriptor. MSAA in WebGL2 cannot texture-attach a multisample
// buffer: the scene draws into `framebuffer` (multisample renderbuffer-backed when sampleCount > 1),
// then resolveWebGLRenderTarget blitFramebuffers into `resolveFramebuffer` (texture-backed). `textures`
// is always the single-sample, sample-after-resolve color — length === colorAttachments. For
// sampleCount === 1, `framebuffer` is texture-backed, `resolveFramebuffer` is null, and `textures`
// are its color attachments directly. `depthTexture` is non-null only for 'depth-stencil-sampled'.
//
// Fields are mutable because resizeWebGLRenderTarget reallocates them in place; callers that must not
// mutate a target take it as `Readonly<WebGLRenderTarget>`.
export interface WebGLRenderTarget {
  width: number;
  height: number;
  format: RenderTargetFormat;
  sampleCount: number;
  framebuffer: WebGLFramebuffer;
  resolveFramebuffer: WebGLFramebuffer | null;
  textures: WebGLTexture[];
  // Attachment-0 color texture (== textures[0]); the common single-attachment read path.
  texture: WebGLTexture;
  depthTexture: WebGLTexture | null;
  colorRenderbuffers: WebGLRenderbuffer[];
  depthStencilRenderbuffer: WebGLRenderbuffer | null;
}

// A free-list of reusable targets. The effect pipeline owns one and lends intermediate targets to
// multi-pass recipes via acquireWebGLRenderTarget / releaseWebGLRenderTarget.
export interface WebGLRenderTargetPool {
  free: WebGLRenderTarget[];
}
