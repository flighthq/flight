import type { Viewport } from '@flighthq/node/contract';
import type { RenderTargetDescriptor } from '@flighthq/render/contract';
export type { GlRenderViewResources } from '@flighthq/render-gl/contract';

import type { Entity } from './Entity.ts';
import type { GlContextOptions } from './GlContext.ts';
import type { GlRenderState } from './GlRenderState.ts';
import type { GlRenderStateOptions } from './GlRenderStateOptions.ts';
import type { GlTextureRenderTarget } from './GlRenderTarget.ts';

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
