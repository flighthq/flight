import type { Entity } from './Entity.ts';
import type { GlContextOptions } from './GlContext.ts';
import type { GlRenderState } from './GlRenderState.ts';
import type { GlRenderStateOptions } from './GlRenderStateOptions.ts';
import type { GlTextureRenderTarget } from './GlRenderTarget.ts';
import type { RenderTargetDescriptor } from './RenderTarget.ts';
import type { Viewport } from './Viewport.ts';

export interface GlAppRenderViewOptions {
  readonly context?: Readonly<GlContextOptions>;
  readonly render?: Readonly<GlRenderStateOptions>;
  readonly target?: Readonly<Omit<RenderTargetDescriptor, 'height' | 'width'>>;
}

export interface GlAppRenderView extends Entity {
  readonly renderState: GlRenderState;
  readonly renderTarget: GlTextureRenderTarget;
  readonly viewport: Viewport;
}

// The render-layer half of a GL application view: the command state, its storage and the drawable
// rectangle a backend allocates for one acquired context. The caller owns any window and the resize
// wiring that reconciles the two; a render backend must not import @flighthq/app. A caller holding both
// composes them explicitly rather than through an assembly package.
export interface GlRenderViewResources extends Entity {
  readonly renderState: GlRenderState;
  readonly renderTarget: GlTextureRenderTarget;
  readonly viewport: Viewport;
}
