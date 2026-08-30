import { logOnce } from '@flighthq/log/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { Kind, RenderRegistryMiss, RenderRegistryMissExplanation, RenderState } from '@flighthq/types/contract';
import { LogLevel, RenderRegistry } from '@flighthq/types/contract';

import { enableRenderRegistrySignals } from './renderRegistrySignals';

export function areRenderRegistryGuardsEnabled(state: RenderState): boolean {
  return _stateIds.has(state);
}

export function enableRenderRegistryGuards(state: RenderState): void {
  if (_stateIds.has(state)) return;
  const stateId = ++_nextStateId;
  _stateIds.set(state, stateId);
  _stateMisses.set(state, []);
  connectSignal(enableRenderRegistrySignals(state).onRegistryMiss, (registry, kind) => {
    recordRenderRegistryMiss(state, stateId, registry, kind);
  });
}

export function explainRenderRegistryMisses(state: RenderState): RenderRegistryMissExplanation {
  const misses = _stateMisses.get(state) ?? [];
  return {
    misses: misses.map((miss) => ({ kind: miss.kind, registry: miss.registry })),
    status: misses.length === 0 ? 'complete' : 'misses-recorded',
  };
}

function getRenderRegistryMissMessage(state: RenderState, registry: RenderRegistry): string {
  switch (registry) {
    // GL composites through an explicit per-mode realization; Canvas and DOM express blend modes
    // natively and never report this.
    case RenderRegistry.BlendRealization:
      return 'a blend mode this scene uses has no registered GL realization, so the node composites as Normal instead — call registerGlBlendMode(state, blendMode, realization)';
    case RenderRegistry.EffectPaddingResolver:
      return 'computeRenderEffectPadding: effect kind has no registered padding resolver — call registerRenderEffectPaddingResolver(state, kind, resolver)';
    // Reported by the resource layer, not the frame path: a material kind with no lister has its
    // texture slots invisible to anything that walks materials. Discovery no longer depends on this
    // (it reads the resource back-edge). On an all-unlisted mesh, reveal-on-resolve leaves the starting
    // alpha unchanged. On a mixed mesh, it can reveal after the listed textures settle while an unlisted
    // texture is still pending.
    case RenderRegistry.MaterialTextureLister:
      return "a material kind in this scene has no registered texture lister, so an all-unlisted mesh gets no fade, while a mixed mesh can reveal before that material's textures settle and show a later texture pop-in — call registerScene3DMaterialTextures(registry, kind, lister), or the named door for that family";
    // Reported only by the GPU backends, where an unresolved material means the node does not draw at
    // all. The Canvas renderer treats a missing material renderer as "draw normally", so the same
    // absence there is the ordinary case rather than a defect.
    case RenderRegistry.MaterialRenderer:
      if ('device' in state)
        return 'resolveWgpuMaterialRenderer: material kind has no registered renderer, so nodes using it do not draw — call registerWgpuMaterialRenderer(state, kind, renderer)';
      return 'resolveGlMaterialRenderer: material kind has no registered renderer, so nodes using it do not draw — call registerGlMaterialRenderer(state, kind, renderer)';
    // Reported by the proactive coverage checks (explainGlScene3DCoverage) rather than by a draw-time
    // miss: the shaded compiler resolves a whole stack at once, so a missing snippet surfaces as a
    // material that will not compile, not as one lookup returning null.
    case RenderRegistry.ModifierSnippet:
      if ('device' in state)
        return 'a modifier on this material has no registered shader snippet — call registerWgpuModifierSnippet(state, snippet), or registerBuiltInWgpuModifierSnippets(state)';
      return 'a modifier on this material has no registered shader snippet — call registerGlModifierSnippet(state, snippet), or registerBuiltInGlModifierSnippets(state)';
    case RenderRegistry.NodeRenderer:
      return 'createRenderProxy: node kind has no registered renderer — call registerRenderer(state, kind, renderer)';
    case RenderRegistry.ShapeCommandHandler:
      return 'renderCanvasShapeCommands: shape command key has no registered handler on this state — call registerCanvasShapeCommand(state, command)';
    // The kind reported is the node kind that went undrawn, since nothing here is keyed by anything else.
    case RenderRegistry.ShapeRasterizer:
      if ('device' in state)
        return 'drawWgpuShape: a fill this node uses has no tessellated form and no rasterizer is registered, so it does not draw — call registerWgpuShapeRasterizer(state, createCanvasShapeRasterizer(resolvers))';
      if ('element' in state)
        return 'drawDomShape: a fill this node uses has no tessellated form and no rasterizer is registered, so it does not draw — call registerDomShapeRasterizer(state, createCanvasShapeRasterizer(resolvers))';
      return 'drawGlShape: a fill this node uses has no tessellated form and no rasterizer is registered, so it does not draw — call registerGlShapeRasterizer(state, createCanvasShapeRasterizer(resolvers))';
    case RenderRegistry.TextureResolver:
      if ('gl' in state)
        return 'resolveGlTexture: texture source kind has no registered resolver — rebuild the GlPipeline with the required resolver and create the render state from that pipeline';
      if ('device' in state)
        return 'resolveWgpuTexture: texture source kind has no registered resolver — call registerWgpuTextureResolver(state, sourceKind, resolver)';
      if ('element' in state)
        return 'resolveDomTexture: texture source kind has no registered resolver — call registerDomTextureResolver(state, sourceKind, resolver)';
      return 'resolveCanvasTexture: texture source kind has no registered resolver — call registerCanvasTextureResolver(resolvers, sourceKind, resolver) on the set the caller resolves through';
  }
}

function recordRenderRegistryMiss(state: RenderState, stateId: number, registry: RenderRegistry, kind: Kind): void {
  const misses = _stateMisses.get(state);
  if (misses === undefined || misses.some((miss) => miss.registry === registry && miss.kind === kind)) return;
  misses.push({ kind, registry });
  logOnce(
    `render:registry-miss:${stateId}:${registry}:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message: getRenderRegistryMissMessage(state, registry),
      registry,
    },
    'render',
  );
}

const _stateIds = new WeakMap<RenderState, number>();
const _stateMisses = new WeakMap<RenderState, RenderRegistryMiss[]>();
let _nextStateId = 0;
