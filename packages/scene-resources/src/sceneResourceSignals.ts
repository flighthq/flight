import { createEntity } from '@flighthq/entity';
import { createSignal } from '@flighthq/signals';
import type { SceneResourceResolver, SceneResourceSignals } from '@flighthq/types';
import { SceneResourceResolverRuntimeKey } from '@flighthq/types';
import type { SceneResourceResolverWithRuntime } from '@flighthq/types';

export function createSceneResourceSignals(): SceneResourceSignals {
  return createEntity({ onResourceFailed: createSignal(), onResourceResolved: createSignal() });
}

// Enables (once) and returns the resolver's availability signals. Idempotent: repeated calls return
// the same group so listeners connected earlier stay attached.
export function enableSceneResourceSignals(resolver: SceneResourceResolver): SceneResourceSignals {
  const runtime = (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey];
  if (runtime.signals !== null) return runtime.signals;
  const signals = createSceneResourceSignals();
  runtime.signals = signals;
  return signals;
}

// Returns the resolver's availability signals, or `null` when they were never enabled.
export function getSceneResourceSignals(resolver: Readonly<SceneResourceResolver>): SceneResourceSignals | null {
  return (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey].signals;
}
