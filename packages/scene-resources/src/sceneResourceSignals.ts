import { createSignal } from '@flighthq/signals';
import type { ImageResourceReference, Signal, Texture } from '@flighthq/types';

import type { SceneResourceResolver } from './sceneResourceResolver';

// One resource-availability event: the Texture whose ref settled and the ref itself (read `ref.state`
// for Resolved vs Failed, or `texture.image` for the bound result on resolve).
export interface SceneResourceEvent {
  ref: ImageResourceReference;
  texture: Texture;
}

// The opt-in availability signal group a resolver emits as refs settle. Loose notification (multiple
// listeners, cancellation, priority) per the signals convention — enabled per resolver via
// enableSceneResourceSignals, which is when the cost is assumed.
export interface SceneResourceSignals {
  onResourceFailed: Signal<(event: Readonly<SceneResourceEvent>) => void>;
  onResourceResolved: Signal<(event: Readonly<SceneResourceEvent>) => void>;
}

export function createSceneResourceSignals(): SceneResourceSignals {
  return { onResourceFailed: createSignal(), onResourceResolved: createSignal() };
}

// Enables (once) and returns the resolver's availability signals. Idempotent: repeated calls return
// the same group so listeners connected earlier stay attached.
export function enableSceneResourceSignals(resolver: SceneResourceResolver): SceneResourceSignals {
  if (resolver.signals !== null) return resolver.signals;
  const signals = createSceneResourceSignals();
  resolver.signals = signals;
  return signals;
}

// Returns the resolver's availability signals, or `null` when they were never enabled.
export function getSceneResourceSignals(resolver: Readonly<SceneResourceResolver>): SceneResourceSignals | null {
  return resolver.signals;
}
