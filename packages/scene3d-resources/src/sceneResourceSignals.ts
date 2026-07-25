import { createEntity } from '@flighthq/entity';
import { createSignal } from '@flighthq/signals';
import type { Scene3DResourceResolver, Scene3DResourceSignals } from '@flighthq/types';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types';
import type { Scene3DResourceResolverWithRuntime } from '@flighthq/types';

export function createScene3DResourceSignals(): Scene3DResourceSignals {
  return createEntity({ onResourceFailed: createSignal(), onResourceResolved: createSignal() });
}

// Enables (once) and returns the resolver's availability signals. Idempotent: repeated calls return
// the same group so listeners connected earlier stay attached.
export function enableScene3DResourceSignals(resolver: Scene3DResourceResolver): Scene3DResourceSignals {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  if (runtime.signals !== null) return runtime.signals;
  const signals = createScene3DResourceSignals();
  runtime.signals = signals;
  return signals;
}

// Returns the resolver's availability signals, or `null` when they were never enabled.
export function getScene3DResourceSignals(resolver: Readonly<Scene3DResourceResolver>): Scene3DResourceSignals | null {
  return (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey].signals;
}
