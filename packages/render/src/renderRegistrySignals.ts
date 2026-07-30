import { createSignal } from '@flighthq/signals/contract';
import type { RenderRegistrySignals, RenderState } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

// Allocates the single release-mode signal seam shared by kind-keyed render registries. Core miss
// branches remain one null check plus emitSignal; guard policy subscribes from a separate package.
export function enableRenderRegistrySignals(state: RenderState): RenderRegistrySignals {
  const runtime = getRenderStateRuntime(state);
  return (runtime.registrySignals ??= { onRegistryMiss: createSignal() });
}
