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
    case RenderRegistry.EffectPaddingResolver:
      return 'computeRenderEffectPadding: effect kind has no registered padding resolver — call registerRenderEffectPaddingResolver(state, kind, resolver)';
    case RenderRegistry.NodeRenderer:
      return 'createRenderProxy: node kind has no registered renderer — call registerRenderer(state, kind, renderer)';
    case RenderRegistry.ShapeCommandHandler:
      return 'renderCanvasShapeCommands: shape command key has no registered handler — call registerCanvasShapeCommand(command)';
    case RenderRegistry.TextureResolver:
      if ('gl' in state)
        return 'resolveGlTexture: texture source kind has no registered resolver — call registerGlTextureResolver(state, sourceKind, resolver), or copyGlRenderStateRegistrations(offscreenState, screenState) after a late screen registration';
      if ('device' in state)
        return 'resolveWgpuTexture: texture source kind has no registered resolver — call registerWgpuTextureResolver(state, sourceKind, resolver)';
      if ('element' in state)
        return 'resolveDomTexture: texture source kind has no registered resolver — call registerDomTextureResolver(state, sourceKind, resolver)';
      return 'resolveCanvasTexture: texture source kind has no registered resolver — call registerCanvasTextureResolver(state, sourceKind, resolver)';
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
