import { getWgpuRenderTextureTarget, writeWgpuRenderTextureTarget } from '@flighthq/render-wgpu/contract';
import type { RenderEffect, RenderTexture, WgpuRenderState, WgpuRenderTexturePool } from '@flighthq/types/contract';

import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

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
  if (sourceTarget === null) return false;
  const operations = effects.flatMap((effect) => {
    const runner = getWgpuRenderEffectRunner(state, effect.kind);
    return runner === null ? [] : [{ effect, runner }];
  });
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
