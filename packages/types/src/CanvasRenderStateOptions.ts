import type { BlendMode } from './BlendMode.ts';
import type { CanvasEffectRunner } from './CanvasEffectState.ts';
import type { CanvasQuadMaterialRenderer } from './CanvasQuadMaterialRenderer.ts';
import type { CanvasRenderOptions } from './CanvasRenderOptions.ts';
import type { CanvasRenderState } from './CanvasRenderState.ts';
import type { CanvasTextureResolvers } from './CanvasTextureResolver.ts';
import type { Kind } from './Entity.ts';
import type { HostCanvasCapability } from './HostCanvas.ts';
import type { RenderStateOptions } from './RenderStateOptions.ts';

export interface CanvasRenderStateOptions extends RenderStateOptions, CanvasRenderOptions {
  blendModeApplication?: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  canvasHost?: Readonly<HostCanvasCapability>;
  canvasTextureResolvers?: CanvasTextureResolvers;
  effects?: ReadonlyMap<Kind, CanvasEffectRunner>;
  materialRenderers?: ReadonlyMap<Kind, CanvasQuadMaterialRenderer>;
}
