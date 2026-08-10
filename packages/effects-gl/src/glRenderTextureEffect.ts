import {
  explainGlRenderTexture,
  getGlRenderTextureTarget,
  withGlRenderState,
  writeGlRenderTextureTarget,
} from '@flighthq/render-gl/contract';
import type {
  GlRenderEffectApplicationExplanation,
  GlRenderEffectApplicationGuard,
  GlRenderState,
  GlRenderTexturePool,
  RenderEffect,
  RenderTexture,
} from '@flighthq/types/contract';

import { getGlRenderEffectRunner, isGlRenderEffectResolvable } from './glRenderEffectRegistry';

// Applies the registered members of a chain from one RenderTexture to another. Each effect composites
// into its destination and this function never clears `dest` or `scratch`; callers reusing either
// texture across frames must clear it first with `clearGlRenderTexture` for frame-stable replacement.
export function applyGlRenderEffectsToRenderTexture(
  state: GlRenderState,
  pool: GlRenderTexturePool,
  source: Readonly<RenderTexture>,
  dest: RenderTexture,
  scratch: RenderTexture,
  effects: ReadonlyArray<Readonly<RenderEffect>>,
): boolean {
  if (source === dest || source === scratch || dest === scratch) {
    throw new Error('applyGlRenderEffectsToRenderTexture: source, destination, and scratch must be distinct');
  }
  const sourceTarget = getGlRenderTextureTarget(state, source);
  const operations = effects.flatMap((effect) => {
    const runner = getGlRenderEffectRunner(state, effect.kind);
    return runner === null ? [] : [{ effect, runner }];
  });
  // Report BEFORE returning: both sentinel exits below leave `dest` unchanged, so a caller that then
  // samples it sees either no published texture or plausible pixels from an older application.
  reportGlRenderEffectApplication(
    state,
    explainGlRenderEffectApplication(
      state,
      effects,
      sourceTarget !== null,
      explainGlRenderTexture(state, dest).status === 'ready',
    ),
  );
  if (sourceTarget === null) return false;
  if (operations.length === 0) return false;

  withGlRenderState(state, () => {
    let current = sourceTarget;
    for (let index = 0; index < operations.length; index++) {
      const operation = operations[index];
      const remaining = operations.length - index;
      const output = remaining % 2 === 1 ? dest : scratch;
      writeGlRenderTextureTarget(state, output, (target) => {
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
      current = getGlRenderTextureTarget(state, output)!;
    }
  });
  return true;
}

// Why an apply call would (or would not) write its destination, without performing it. Pure query over
// the same registry the apply path consults, so a caller can ask ahead of time or explain after the
// fact. `sourceAvailable` reports whether the source RenderTexture has a realized GL target;
// `destinationAvailable` reports whether a failed call would leave previously published pixels behind.
export function explainGlRenderEffectApplication(
  state: GlRenderState,
  effects: ReadonlyArray<Readonly<RenderEffect>>,
  sourceAvailable: boolean,
  destinationAvailable = false,
): GlRenderEffectApplicationExplanation {
  const unregisteredKinds: string[] = [];
  // Indexes, not kinds: two effects of the SAME kind can differ on whether they resolve, so the only
  // honest identifier for an unresolved effect is where it sits in the submitted chain.
  const unresolvedIndexes: number[] = [];
  for (let index = 0; index < effects.length; index++) {
    const effect = effects[index];
    if (getGlRenderEffectRunner(state, effect.kind) === null) unregisteredKinds.push(effect.kind);
    else if (!isGlRenderEffectResolvable(state, effect)) unresolvedIndexes.push(index);
  }
  const requestedCount = effects.length;
  const registeredCount = requestedCount - unregisteredKinds.length;
  return { registeredCount, requestedCount, status: getStatus(), unregisteredKinds, unresolvedIndexes };

  function getStatus(): GlRenderEffectApplicationExplanation['status'] {
    // An empty chain is a no-op the caller asked for, NOT a miss — reporting it would train readers to
    // ignore the crumb. A ready destination is the highest-cost failed-call outcome because consumers
    // keep sampling plausible pixels from an older application instead of an empty texture.
    if (requestedCount === 0) return 'no-effects';
    if (destinationAvailable && (!sourceAvailable || registeredCount === 0)) return 'stale-destination';
    if (!sourceAvailable) return 'source-unavailable';
    if (registeredCount === 0) return 'unregistered-effects';
    // Registration outranks resolution: a dropped effect is the worse picture, and its fix (register
    // the kind) has to happen before the resolution question is even meaningful. The explanation still
    // carries both lists, so a reporter can name the passthroughs whichever status won.
    if (unregisteredKinds.length > 0) return 'partial-registration';
    if (unresolvedIndexes.length === 0) return 'complete';
    return unresolvedIndexes.length === registeredCount ? 'unresolved-effects' : 'partial-resolution';
  }
}

// The diagnostics seam. Core stays message-free; enableGlRenderEffectGuards installs the reporter that
// turns these observations into caller-facing warnings.
export function setGlRenderEffectApplicationGuard(
  state: GlRenderState,
  guard: GlRenderEffectApplicationGuard | null,
): void {
  if (guard === null) _guards.delete(state);
  else _guards.set(state, guard);
}

function reportGlRenderEffectApplication(
  state: GlRenderState,
  explanation: Readonly<GlRenderEffectApplicationExplanation>,
): void {
  if (explanation.status === 'complete' || explanation.status === 'no-effects') return;
  _guards.get(state)?.(state, explanation);
}

const _guards = new WeakMap<GlRenderState, GlRenderEffectApplicationGuard>();
