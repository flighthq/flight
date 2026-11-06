import type { RenderTargetColorSpace } from '@flighthq/render/contract';
import type { Entity } from '@flighthq/types/contract';

import type { GlContext } from './types.ts';

// A single-sample RGBA16F cubemap whose six faces share one framebuffer attachment point. The
// framebuffer is reattached to the selected face by beginGlCubeRenderFace. `textures` mirrors the
// active-target shape used by framebuffer-feedback diagnostics; its sole entry is `texture`.
export interface GlCubeRenderTarget extends Entity {
  readonly gl: GlContext;
  colorSpace: RenderTargetColorSpace;
  depthStencilRenderbuffer: WebGLRenderbuffer | null;
  framebuffer: WebGLFramebuffer;
  height: number;
  size: number;
  texture: WebGLTexture;
  textures: WebGLTexture[];
  width: number;
}

export interface GlCubeRenderTargetOptions {
  depth?: boolean;
}
