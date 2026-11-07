import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Viewport } from '@flighthq/node/contract';
import type { RenderTargetDescriptor } from '@flighthq/render/contract';

import type { GlRenderStateOptions } from './glRenderStateOptionsTypes.ts';
import type { GlRenderState } from './glRenderStateTypes.ts';
import type { GlTextureRenderTarget } from './glRenderTargetTypes.ts';
import type { GlContextOptions } from './types.ts';

export interface GlAppRenderView extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly renderState: GlRenderState;
  readonly renderTarget: GlTextureRenderTarget;
  readonly viewport: Viewport;
}

export interface GlAppRenderViewOptions {
  readonly context?: Readonly<GlContextOptions>;
  readonly render?: Readonly<GlRenderStateOptions>;
  readonly target?: Readonly<Omit<RenderTargetDescriptor, 'height' | 'width'>>;
}
