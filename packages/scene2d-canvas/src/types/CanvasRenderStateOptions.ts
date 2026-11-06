import type { Kind } from '@flighthq/entity/contract';
import type { BlendMode } from '@flighthq/materials/contract';
import type { RenderStateOptions } from '@flighthq/render/contract';
import type { HostCanvasCapability } from '@flighthq/surface/contract';

import type { CanvasEffectRunner } from './CanvasEffect.ts';
import type { CanvasQuadMaterialRenderer } from './CanvasMaterial.ts';
import type { CanvasRenderOptions } from './CanvasRenderOptions.ts';
import type { CanvasRenderState } from './CanvasRenderState.ts';
import type { CanvasTextureResolvers } from './CanvasTextureResolver.ts';

export interface CanvasRenderStateOptions extends RenderStateOptions, CanvasRenderOptions {
  blendModeApplication?: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  canvasHost?: Readonly<HostCanvasCapability>;
  canvasTextureResolvers?: CanvasTextureResolvers;
  effects?: ReadonlyMap<Kind, CanvasEffectRunner>;
  materialRenderers?: ReadonlyMap<Kind, CanvasQuadMaterialRenderer>;
}
