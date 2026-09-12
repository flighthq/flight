import type { Entity } from './Entity';
import type { GlContext } from './GlContext';
import type {
  RenderTargetAxes,
  RenderTargetColorSpace,
  RenderTargetDepth,
  RenderTargetDimensions,
  RenderTargetFormat,
} from './RenderTarget';

// Base type for all GL render targets — what pass functions need (bind + clear + viewport).
// `framebuffer` is null for the screen (default framebuffer) and a WebGLFramebuffer for offscreen
// texture targets. Pass functions accept this base; sampling/present functions accept only
// GlTextureRenderTarget — the type split makes sampling a compile-time constraint.
export interface GlRenderTarget extends Entity, RenderTargetDimensions {
  readonly gl: GlContext;
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
  colorAttachments: number;
  colorSpace: RenderTargetColorSpace;
}

// The default framebuffer (canvas). framebuffer is always null, colorAttachments is always 1.
// Width/height synced from drawingBufferWidth/drawingBufferHeight. Not sampleable — there is no
// texture handle on the default framebuffer.
export interface GlScreenRenderTarget extends GlRenderTarget {
  framebuffer: null;
}

// Gl realization of a RenderTargetDescriptor. MSAA in Gl2 cannot texture-attach a multisample
// buffer: the scene draws into `framebuffer` (multisample renderbuffer-backed when sampleCount > 1),
// then resolveGlRenderTarget blitFramebuffers into `resolveFramebuffer` (texture-backed). `textures`
// is always the single-sample, sample-after-resolve color — length === colorAttachments. For
// sampleCount === 1, `framebuffer` is texture-backed, `resolveFramebuffer` is null, and `textures`
// are its color attachments directly. `depthTexture` is non-null only for 'depth-stencil-sampled'.
//
// Fields are mutable because resizeGlRenderTarget reallocates them in place; callers that must not
// mutate a target take it as `Readonly<GlTextureRenderTarget>`.
export interface GlTextureRenderTarget extends GlRenderTarget {
  framebuffer: WebGLFramebuffer;
  // Canonical caller request after backend-neutral defaults. Effective storage lives on the direct
  // target axes below; explainGlRenderTarget compares the two without reconstructing intent.
  requestedAxes: RenderTargetAxes;
  format: RenderTargetFormat;
  colorFormats: RenderTargetFormat[];
  depth: RenderTargetDepth;
  sampleCount: number;
  resolveFramebuffer: WebGLFramebuffer | null;
  textures: WebGLTexture[];
  // Attachment-0 color texture (== textures[0]); the common single-attachment read path.
  texture: WebGLTexture;
  depthTexture: WebGLTexture | null;
  colorRenderbuffers: WebGLRenderbuffer[];
  depthStencilRenderbuffer: WebGLRenderbuffer | null;
}

// A free-list of reusable texture targets. The effect pipeline owns one and lends intermediate
// targets to multi-pass recipes via acquireGlRenderTarget / releaseGlRenderTarget.
export interface GlTextureRenderTargetPool extends Entity {
  free: GlTextureRenderTarget[];
}
