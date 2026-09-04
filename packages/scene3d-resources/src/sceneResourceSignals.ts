import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal } from '@flighthq/signals/contract';
import type {
  Scene3DResourceResolverWithRuntime,
  Scene3DResourceSignals,
  EntityConstruction,
} from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';

export function createScene3DResourceSignals(): Scene3DResourceSignals {
  const out = allocateEntity<Scene3DResourceSignals>();
  initializeScene3DResourceSignals(out);
  return finishEntity(out);
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

export function initializeScene3DResourceSignals(out: EntityConstruction<Scene3DResourceSignals>): void {
  out.onResourceFailed = createSignal();
  out.onResourceResolved = createSignal();
}
