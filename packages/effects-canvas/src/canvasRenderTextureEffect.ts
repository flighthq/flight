import { getCanvasRenderTextureTarget, writeCanvasRenderTextureTarget } from '@flighthq/scene2d-canvas/contract';
import type { CanvasRenderState, CanvasRenderTexturePool, RenderEffect, RenderTexture } from '@flighthq/types/contract';

import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Applies registered Canvas effect runners from one completed RenderTexture into another. The
// caller supplies one distinct scratch lease; parity chooses the first destination so the final
// registered operation always publishes `dest`.
export function applyCanvasRenderEffectsToRenderTexture(
  ownerState: CanvasRenderState,
  effectState: CanvasRenderState,
  pool: CanvasRenderTexturePool,
  source: Readonly<RenderTexture>,
  dest: RenderTexture,
  scratch: RenderTexture,
  effects: ReadonlyArray<Readonly<RenderEffect>>,
): boolean {
  if (source === dest || source === scratch || dest === scratch) {
    throw new Error('applyCanvasRenderEffectsToRenderTexture: source, destination, and scratch must be distinct');
  }
  const sourceTarget = getCanvasRenderTextureTarget(ownerState, source);
  if (sourceTarget === null) return false;
  const operations = effects.flatMap((effect) => {
    const runner = getCanvasRenderEffectRunner(effectState, effect.kind);
    return runner === null ? [] : [{ effect, runner }];
  });
  if (operations.length === 0) return false;

  let current = sourceTarget;
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index];
    const remaining = operations.length - index;
    const output = remaining % 2 === 1 ? dest : scratch;
    writeCanvasRenderTextureTarget(ownerState, output, (target) => {
      operation.runner(
        { state: effectState, source: current, dest: target, pool: pool.effectTargets },
        operation.effect,
      );
    });
    current = getCanvasRenderTextureTarget(ownerState, output)!;
  }
  return true;
}
