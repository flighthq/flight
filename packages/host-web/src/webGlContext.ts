import type { GlContext, GlContextOptions } from '@flighthq/types/contract';

export function createWebGlContext(canvas: HTMLCanvasElement, options: Readonly<GlContextOptions> = {}): GlContext {
  const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: options.antialias ?? true,
    powerPreference: options.powerPreference ?? 'default',
    stencil: true,
    ...options.contextAttributes,
  };
  const context = canvas.getContext('webgl2', contextAttributes);
  if (context === null) throw new Error('Failed to get WebGL2 context.');
  return context;
}
