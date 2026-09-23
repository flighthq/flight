import type { BlendMode } from './BlendMode';
import type { CanvasEffectRunner } from './CanvasEffectState';
import type { CanvasQuadMaterialRenderer } from './CanvasQuadMaterialRenderer';
import type { CanvasRenderOptions } from './CanvasRenderOptions';
import type { CanvasRenderState } from './CanvasRenderState';
import type { CanvasTextureResolvers } from './CanvasTextureResolver';
import type { Kind } from './Entity';
import type { HostCanvasCapability } from './HostCanvas';
import type { RenderStateOptions } from './RenderStateOptions';

export interface CanvasRenderStateOptions extends RenderStateOptions, CanvasRenderOptions {
  blendModeApplication?: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  canvasHost?: Readonly<HostCanvasCapability>;
  canvasTextureResolvers?: CanvasTextureResolvers;
  effects?: ReadonlyMap<Kind, CanvasEffectRunner>;
  materialRenderers?: ReadonlyMap<Kind, CanvasQuadMaterialRenderer>;
}
