import { explainImageResourceReferenceResolution } from '@flighthq/image/contract';
import { logOnce } from '@flighthq/log/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type { Scene3DResourceEvent, Scene3DResourceResolverWithRuntime } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { enableScene3DResourceSignals } from './sceneResourceSignals';

// Returns whether the failure guard is installed on `resolver`.
export function areScene3DResourceFailureGuardsEnabled(
  resolver: Readonly<Scene3DResourceResolverWithRuntime>,
): boolean {
  return _guards.has(resolver);
}

// Removes the resolver-scoped guard. Repeated calls are harmless.
export function disableScene3DResourceFailureGuards(resolver: Scene3DResourceResolverWithRuntime): void {
  const guard = _guards.get(resolver);
  if (guard === undefined) return;
  const signals = enableScene3DResourceSignals(resolver);
  disconnectSignal(signals.onResourceFailed, guard.failed);
  disconnectSignal(signals.onResourceResolved, guard.resolved);
  _guards.delete(resolver);
}

// Installs an opt-in warning guard over the resolver's failure signal. The async resolver still
// settles normally and never throws for an expected unavailable image; diagnostics remain in this
// separately imported module so the base resolver does not carry @flighthq/log. One shared reference
// warns once per failed attempt, even when several Texture subscribers receive the event. Idempotent.
export function enableScene3DResourceFailureGuards(resolver: Scene3DResourceResolverWithRuntime): () => void {
  if (_guards.has(resolver)) return () => disableScene3DResourceFailureGuards(resolver);
  const warned = new WeakMap<Scene3DResourceEvent['ref'], Scene3DResourceEvent['ref']['failure']>();
  const signals = enableScene3DResourceSignals(resolver);
  const failed = (event: Readonly<Scene3DResourceEvent>): void => {
    if (warned.has(event.ref) && warned.get(event.ref) === event.ref.failure) return;
    warned.set(event.ref, event.ref.failure);
    const explanation = explainImageResourceReferenceResolution(event.ref);
    logOnce(
      `scene-resources:image-resource-resolution-failed:${++_attemptId}`,
      LogLevel.Warn,
      {
        failureKind: explanation.failure?.kind ?? null,
        failureName: explanation.failure?.name ?? null,
        failureMessage: explanation.failure?.message ?? null,
        message: 'Scene3D resource acquisition failed — call retryFailedScene3DResources to request it again',
        resourceKind: explanation.kind,
      },
      'scene-resources',
    );
  };
  const resolved = (event: Readonly<Scene3DResourceEvent>): void => {
    warned.delete(event.ref);
  };
  connectSignal(signals.onResourceFailed, failed);
  connectSignal(signals.onResourceResolved, resolved);
  _guards.set(resolver, { failed, resolved });
  return () => disableScene3DResourceFailureGuards(resolver);
}

interface Scene3DResourceFailureGuard {
  failed: (event: Readonly<Scene3DResourceEvent>) => void;
  resolved: (event: Readonly<Scene3DResourceEvent>) => void;
}

const _guards = new WeakMap<Readonly<Scene3DResourceResolverWithRuntime>, Scene3DResourceFailureGuard>();
let _attemptId = 0;
