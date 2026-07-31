import { getGlRenderTextureTarget, withGlRenderState, writeGlRenderTextureTarget } from '@flighthq/render-gl/contract';
import type {
  GlRenderEffectApplicationExplanation,
  GlRenderEffectApplicationGuard,
  GlRenderState,
  GlRenderTexturePool,
  RenderEffect,
  RenderTexture,
} from '@flighthq/types/contract';

import { getGlRenderEffectRunner } from './glRenderEffectRegistry';

// Applies the registered members of a chain from one RenderTexture to another. The caller supplies
// one distinct scratch lease; parity chooses the first destination so the last registered effect
// always lands in `dest`.
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
  // Report BEFORE returning: both sentinel exits below leave `dest` unwritten, and a caller that then
  // samples it reads a never-written texture rather than seeing an error.
  reportGlRenderEffectApplication(state, explainGlRenderEffectApplication(state, effects, sourceTarget !== null));
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
// fact. `sourceAvailable` reports whether the source RenderTexture has a realized GL target.
export function explainGlRenderEffectApplication(
  state: GlRenderState,
  effects: ReadonlyArray<Readonly<RenderEffect>>,
  sourceAvailable: boolean,
): GlRenderEffectApplicationExplanation {
  const unregisteredKinds = effects
    .filter((effect) => getGlRenderEffectRunner(state, effect.kind) === null)
    .map((effect) => effect.kind);
  const requestedCount = effects.length;
  const registeredCount = requestedCount - unregisteredKinds.length;
  return { registeredCount, requestedCount, status: getStatus(), unregisteredKinds };

  function getStatus(): GlRenderEffectApplicationExplanation['status'] {
    // An empty chain is a no-op the caller asked for, NOT a miss — reporting it would train readers to
    // ignore the crumb. Source availability is checked next because it explains a false return even
    // when every effect is registered.
    if (requestedCount === 0) return 'no-effects';
    if (!sourceAvailable) return 'source-unavailable';
    if (registeredCount === 0) return 'unregistered-effects';
    return unregisteredKinds.length > 0 ? 'partial-registration' : 'complete';
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
