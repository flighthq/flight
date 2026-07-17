import type { RenderTargetColorSpace, RenderTargetFormat } from './RenderTarget';

// Gl realization of a RenderTargetDescriptor. MSAA in Gl2 cannot texture-attach a multisample
// buffer: the scene draws into `framebuffer` (multisample renderbuffer-backed when sampleCount > 1),
// then resolveGlRenderTarget blitFramebuffers into `resolveFramebuffer` (texture-backed). `textures`
// is always the single-sample, sample-after-resolve color — length === colorAttachments. For
// sampleCount === 1, `framebuffer` is texture-backed, `resolveFramebuffer` is null, and `textures`
// are its color attachments directly. `depthTexture` is non-null only for 'depth-stencil-sampled'.
//
// Fields are mutable because resizeGlRenderTarget reallocates them in place; callers that must not
// mutate a target take it as `Readonly<GlRenderTarget>`.
export interface GlRenderTarget {
  width: number;
  height: number;
  format: RenderTargetFormat;
  // Declared color space of the target's content (resolved from the descriptor; default 'srgb'). The
  // present step reads this to run the linear->sRGB encode exactly once for 'linear' targets.
  colorSpace: RenderTargetColorSpace;
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
// multi-pass recipes via acquireGlRenderTarget / releaseGlRenderTarget.
export interface GlRenderTargetPool {
  free: GlRenderTarget[];
}
