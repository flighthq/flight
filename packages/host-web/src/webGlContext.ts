import type { GlContext, GlContextOptions } from '@flighthq/types/contract';

export function createWebGlContext(canvas: HTMLCanvasElement, options: Readonly<GlContextOptions> = {}): GlContext {
  const context = getWebGlContext(canvas, options);
  if (context === null) throw new Error('Failed to get WebGL2 context.');
  return context;
}

// The nullable form of createWebGlContext, for the host.gl acquire hook: a canvas the browser refuses
// WebGL2 on is an expected platform outcome, so the capability reports it as null rather than throwing
// across the seam. createWebGlContext stays the strict escape hatch for callers that require a context.
export function getWebGlContext(canvas: HTMLCanvasElement, options: Readonly<GlContextOptions> = {}): GlContext | null {
  const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: options.antialias ?? true,
    powerPreference: options.powerPreference ?? 'default',
    stencil: true,
    ...options.contextAttributes,
  };
  return canvas.getContext('webgl2', contextAttributes);
}
