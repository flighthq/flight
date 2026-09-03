import { createEntity } from '@flighthq/entity/contract';
import { createSignal } from '@flighthq/signals/contract';
import type { Scene3DResourceResolverWithRuntime, Scene3DResourceSignals } from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';

export function createScene3DResourceSignals(): Scene3DResourceSignals {
  return createEntity({ onResourceFailed: createSignal(), onResourceResolved: createSignal() });
}

// Enables (once) and returns the resolver's availability signals. Idempotent: repeated calls return
// the same group so listeners connected earlier stay attached.
export function enableScene3DResourceSignals(resolver: Scene3DResourceResolverWithRuntime): Scene3DResourceSignals {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
  if (runtime.signals !== null) return runtime.signals;
  const signals = createScene3DResourceSignals();
  runtime.signals = signals;
  return signals;
}

// Returns the resolver's availability signals, or `null` when they were never enabled.
export function getScene3DResourceSignals(
  resolver: Readonly<Scene3DResourceResolverWithRuntime>,
): Scene3DResourceSignals | null {
  return resolver[Scene3DResourceResolverRuntimeKey].signals;
}
