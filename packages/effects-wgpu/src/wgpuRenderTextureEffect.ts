import { getWgpuRenderTextureTarget, writeWgpuRenderTextureTarget } from '@flighthq/render-wgpu/contract';
import type {
  RenderEffect,
  RenderTexture,
  WgpuRenderEffectApplicationExplanation,
  WgpuRenderEffectApplicationGuard,
  WgpuRenderEffectApplicationStatus,
  WgpuRenderState,
  WgpuRenderTexturePool,
} from '@flighthq/types/contract';

import { getWgpuRenderEffectRunner, isWgpuRenderEffectResolvable } from './wgpuRenderEffectRegistry';

// Encodes the registered members of a chain from one completed RenderTexture into another. The
// caller owns an active command encoder and supplies one distinct scratch lease. Parity chooses the
// first destination so the final registered operation always publishes `dest`.
export function applyWgpuRenderEffectsToRenderTexture(
  state: WgpuRenderState,
  pool: WgpuRenderTexturePool,
  source: Readonly<RenderTexture>,
  dest: RenderTexture,
  scratch: RenderTexture,
  effects: ReadonlyArray<Readonly<RenderEffect>>,
): boolean {
  if (source === dest || source === scratch || dest === scratch) {
    throw new Error('applyWgpuRenderEffectsToRenderTexture: source, destination, and scratch must be distinct');
  }
  const sourceTarget = getWgpuRenderTextureTarget(state, source);
  const unregisteredKinds: string[] = [];
  const unresolvedIndexes: number[] = [];
  const operations = effects.flatMap((effect, index) => {
    const runner = getWgpuRenderEffectRunner(state, effect.kind);
    if (runner === null) {
      unregisteredKinds.push(effect.kind);
      return [];
    }
    if (!isWgpuRenderEffectResolvable(state, effect)) unresolvedIndexes.push(index);
    return [{ effect, runner }];
  });
  // Reported BEFORE either early return, because both of them are the silent cases: a false return that
  // never wrote `dest` leaves whatever a consumer last sampled in place, which reads as a stale frame
  // rather than as a failed call.
  reportWgpuRenderEffectApplication(state, {
    registeredCount: operations.length,
    requestedCount: effects.length,
    status: getWgpuRenderEffectApplicationStatus(
      effects.length,
      operations.length,
      unresolvedIndexes.length,
      sourceTarget !== null,
      getWgpuRenderTextureTarget(state, dest) !== null,
    ),
    unregisteredKinds,
    unresolvedIndexes,
  });
  if (sourceTarget === null) return false;
  if (operations.length === 0) return false;

  let current = sourceTarget;
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index];
    const remaining = operations.length - index;
    const output = remaining % 2 === 1 ? dest : scratch;
    writeWgpuRenderTextureTarget(state, output, (target) => {
      operation.runner(
        {
          state,
          source: current,
          dest: target,
          pool: pool.effectTargets,
          sceneDepthTexture: null,
          sceneVelocityTexture: null,
        },
        operation.effect,
      );
    });
    current = getWgpuRenderTextureTarget(state, output)!;
  }
  return true;
}

/** Explains why an application did not do what the caller asked, as plain data. */
export function explainWgpuRenderEffectApplication(
  state: WgpuRenderState,
  source: Readonly<RenderTexture>,
  dest: Readonly<RenderTexture>,
  effects: ReadonlyArray<Readonly<RenderEffect>>,
): WgpuRenderEffectApplicationExplanation {
  const unregisteredKinds: string[] = [];
  const unresolvedIndexes: number[] = [];
  for (let index = 0; index < effects.length; index++) {
    const effect = effects[index];
    if (getWgpuRenderEffectRunner(state, effect.kind) === null) unregisteredKinds.push(effect.kind);
    else if (!isWgpuRenderEffectResolvable(state, effect)) unresolvedIndexes.push(index);
  }
  const registeredCount = effects.length - unregisteredKinds.length;
  return {
    registeredCount,
    requestedCount: effects.length,
    status: getWgpuRenderEffectApplicationStatus(
      effects.length,
      registeredCount,
      unresolvedIndexes.length,
      getWgpuRenderTextureTarget(state, source) !== null,
      getWgpuRenderTextureTarget(state, dest) !== null,
    ),
    unregisteredKinds,
    unresolvedIndexes,
  };
}

// The diagnostics seam. Core stays message-free; enableWgpuRenderEffectGuards installs the reporter that
// turns these observations into caller-facing warnings.
export function setWgpuRenderEffectApplicationGuard(
  state: WgpuRenderState,
  guard: WgpuRenderEffectApplicationGuard | null,
): void {
  if (guard === null) _guards.delete(state);
  else _guards.set(state, guard);
}

function getWgpuRenderEffectApplicationStatus(
  requestedCount: number,
  registeredCount: number,
  unresolvedCount: number,
  sourceAvailable: boolean,
  destinationAvailable: boolean,
): WgpuRenderEffectApplicationStatus {
  // An empty chain is a no-op the caller asked for, NOT a miss — reporting it would train readers to
  // ignore the crumb. A ready destination is the highest-cost failed-call outcome, because consumers
  // keep sampling plausible pixels from an older application instead of an empty texture.
  if (requestedCount === 0) return 'no-effects';
  if (destinationAvailable && (!sourceAvailable || registeredCount === 0)) return 'stale-destination';
  if (!sourceAvailable) return 'source-unavailable';
  if (registeredCount === 0) return 'unregistered-effects';
  if (registeredCount < requestedCount) return 'partial-registration';
  if (unresolvedCount === 0) return 'complete';
  return unresolvedCount === registeredCount ? 'unresolved-effects' : 'partial-resolution';
}

function reportWgpuRenderEffectApplication(
  state: WgpuRenderState,
  explanation: Readonly<WgpuRenderEffectApplicationExplanation>,
): void {
  if (explanation.status === 'complete' || explanation.status === 'no-effects') return;
  _guards.get(state)?.(state, explanation);
}

const _guards = new WeakMap<WgpuRenderState, WgpuRenderEffectApplicationGuard>();
