import { explainScene2DCoverage, hasScene2DCoverage } from '@flighthq/render/contract';
import type { CanvasRenderState, Scene2DKindUsage, SceneCoverageEntry } from '@flighthq/types/contract';
import { RenderRegistry, SceneCoverage } from '@flighthq/types/contract';

import { getCanvasMaterialRenderer } from './canvasMaterialRegistry';

// Clears `out`, then reports every requirement in `usage` with how well this Canvas state is wired for
// it — satisfied entries included, so one call is a complete manifest.
//
// Composes rather than restates: the node-renderer and shape-command registries live on the base render
// state and are answered by explainScene2DCoverage for every backend alike, so this appends only what is
// Canvas's own. There is no blend half — Canvas composites every blend mode natively through
// globalCompositeOperation, with nothing to register.
export function explainCanvasScene2DCoverage(
  out: SceneCoverageEntry[],
  state: CanvasRenderState,
  usage: Readonly<Scene2DKindUsage>,
): void {
  explainScene2DCoverage(out, state, usage);
  collectCanvasScene2DCoverageGaps(out, state, usage, false);
}

// Whether this state can serve everything `usage` names, Canvas specifics included. Stops at the first
// shortfall and never allocates. Use the explain form to find out WHICH requirement and how badly.
export function hasCanvasScene2DCoverage(state: CanvasRenderState, usage: Readonly<Scene2DKindUsage>): boolean {
  if (!hasScene2DCoverage(state, usage)) return false;
  return !collectCanvasScene2DCoverageGaps(null, state, usage, true);
}

// Appends the Canvas-only half. `found` counts only real shortfalls, so appending satisfied entries
// never flips the predicate.
function collectCanvasScene2DCoverageGaps(
  out: SceneCoverageEntry[] | null,
  state: CanvasRenderState,
  usage: Readonly<Scene2DKindUsage>,
  stopAtFirst: boolean,
): boolean {
  let found = false;

  // Always Fallback, never Missing — the opposite of the GPU backends. A Canvas material only
  // contributes extra draw state (composite, filter) on top of a draw the node renderer already
  // performs, so an unregistered kind means the node still appears, without the material's
  // contribution. Nothing vanishes, so this is a downgrade to name rather than a failure to block on.
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (getCanvasMaterialRenderer(state, kind) !== null) {
      out?.push({ coverage: SceneCoverage.Satisfied, kind, registry: RenderRegistry.MaterialRenderer });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: SceneCoverage.Fallback, kind, registry: RenderRegistry.MaterialRenderer });
  }

  return found;
}
