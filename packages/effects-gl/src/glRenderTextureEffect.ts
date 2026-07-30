import { getGlRenderTextureTarget, withGlRenderState, writeGlRenderTextureTarget } from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTexturePool, RenderEffect, RenderTexture } from '@flighthq/types/contract';

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
  if (sourceTarget === null) return false;
  const operations = effects.flatMap((effect) => {
    const runner = getGlRenderEffectRunner(state, effect.kind);
    return runner === null ? [] : [{ effect, runner }];
  });
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
