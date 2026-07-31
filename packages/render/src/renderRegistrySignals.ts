import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type { RenderRegistrySignals, RenderState, RenderStateRuntime } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

type RenderRegistryMissEmitter = NonNullable<RenderStateRuntime['registryMiss']>;

// Allocates the single opt-in signal seam shared by kind-keyed render registries. Core dispatch owns
// only a nullable callback, so release bundles that do not import this diagnostics lane carry neither
// signal emission nor signal teardown machinery.
export function enableRenderRegistrySignals(state: RenderState): RenderRegistrySignals {
  const runtime = getRenderStateRuntime(state);
  if (runtime.registryMiss !== null) return runtime.registryMiss.signals;
  const signals: RenderRegistrySignals = { onRegistryMiss: createSignal() };
  const emitter = ((registry, kind) => emitSignal(signals.onRegistryMiss, registry, kind)) as RenderRegistryMissEmitter;
  Object.assign(emitter, {
    clear: () => clearSignal(signals.onRegistryMiss),
    signals,
  });
  runtime.registryMiss = emitter;
  return signals;
}
