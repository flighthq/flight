import { logOnce } from '@flighthq/log';
import { connectSignal, disconnectSignal } from '@flighthq/signals';
import type { SceneResourceEvent, SceneResourceResolver } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { explainImageResourceReferenceResolution } from './sceneResourceRecovery';
import { enableSceneResourceSignals } from './sceneResourceSignals';

// Returns whether the failure guard is installed on `resolver`.
export function areSceneResourceFailureGuardsEnabled(resolver: Readonly<SceneResourceResolver>): boolean {
  return _guards.has(resolver);
}

// Removes the resolver-scoped guard. Repeated calls are harmless.
export function disableSceneResourceFailureGuards(resolver: SceneResourceResolver): void {
  const guard = _guards.get(resolver);
  if (guard === undefined) return;
  const signals = enableSceneResourceSignals(resolver);
  disconnectSignal(signals.onResourceFailed, guard.failed);
  disconnectSignal(signals.onResourceResolved, guard.resolved);
  _guards.delete(resolver);
}

// Installs an opt-in warning guard over the resolver's failure signal. The async resolver still
// settles normally and never throws for an expected unavailable image; diagnostics remain in this
// separately imported module so the base resolver does not carry @flighthq/log. One shared reference
// warns once per failed attempt, even when several Texture subscribers receive the event. Idempotent.
export function enableSceneResourceFailureGuards(resolver: SceneResourceResolver): () => void {
  if (_guards.has(resolver)) return () => disableSceneResourceFailureGuards(resolver);
  const warned = new WeakMap<SceneResourceEvent['ref'], SceneResourceEvent['ref']['failure']>();
  const signals = enableSceneResourceSignals(resolver);
  const failed = (event: Readonly<SceneResourceEvent>): void => {
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
        message:
          'resolveSceneResources: image resource resolution failed — call retryFailedSceneResources to request it again',
        resourceKind: explanation.kind,
      },
      'scene-resources',
    );
  };
  const resolved = (event: Readonly<SceneResourceEvent>): void => {
    warned.delete(event.ref);
  };
  connectSignal(signals.onResourceFailed, failed);
  connectSignal(signals.onResourceResolved, resolved);
  _guards.set(resolver, { failed, resolved });
  return () => disableSceneResourceFailureGuards(resolver);
}

interface SceneResourceFailureGuard {
  failed: (event: Readonly<SceneResourceEvent>) => void;
  resolved: (event: Readonly<SceneResourceEvent>) => void;
}

const _guards = new WeakMap<Readonly<SceneResourceResolver>, SceneResourceFailureGuard>();
let _attemptId = 0;
