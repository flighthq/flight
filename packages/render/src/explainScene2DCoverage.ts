import type { RenderState, Scene2DKindUsage, SceneCoverageEntry } from '@flighthq/types/contract';
import { RenderRegistry, SceneCoverage } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

// Clears `out`, then reports every requirement in `usage` that any 2D backend answers the same way,
// with how well this state is wired for it — satisfied entries included, so one call is a manifest.
//
// This covers the two registries that live on the BASE render-state runtime and so mean the same thing
// on Canvas, DOM, GL and WebGPU: the node-renderer map every backend dispatches through, and the shape
// command set every backend replays through when it rasterizes. A backend adds its own specifics — GL
// blend realizations, per-backend material renderers — on top of this, rather than restating it.
//
// Unlike the 3D seam, node kinds ARE a requirement here: the 2D pipeline resolves every node through
// `registerRenderer(state, kind, renderer)`, where the 3D pipeline collects meshes structurally.
export function explainScene2DCoverage(
  out: SceneCoverageEntry[],
  state: RenderState,
  usage: Readonly<Scene2DKindUsage>,
): void {
  out.length = 0;
  collectScene2DCoverageGaps(out, state, usage, false);
}

// Whether this state can serve every node kind and shape command `usage` names. Stops at the first
// shortfall and never allocates. Use the explain form to find out WHICH requirement and how badly.
export function hasScene2DCoverage(state: RenderState, usage: Readonly<Scene2DKindUsage>): boolean {
  return !collectScene2DCoverageGaps(null, state, usage, true);
}

// The single implementation both tiers read, so the boolean can never disagree with the explanation.
// `found` counts only real shortfalls, so appending satisfied entries to `out` never flips the predicate.
function collectScene2DCoverageGaps(
  out: SceneCoverageEntry[] | null,
  state: RenderState,
  usage: Readonly<Scene2DKindUsage>,
  stopAtFirst: boolean,
): boolean {
  let found = false;
  const runtime = getRenderStateRuntime(state);

  // A node kind with no renderer produces no render proxy, so the node and its whole subtree are
  // absent from the frame — the loudest failure in this seam and the one worth asking about first.
  for (let i = 0; i < usage.nodeKinds.length; i++) {
    const kind = usage.nodeKinds[i];
    if (runtime.rendererMap.has(kind)) {
      out?.push({ coverage: SceneCoverage.Satisfied, kind, registry: RenderRegistry.NodeRenderer });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: SceneCoverage.Missing, kind, registry: RenderRegistry.NodeRenderer });
  }

  // Only meaningful for a state that rasterizes shapes. A GL or WebGPU state drawing every shape
  // through the mesh path never replays a command, so these entries are reported and simply not acted
  // on — the same shape as reporting 3D node kinds a backend collects structurally.
  const commands = runtime.canvasShapeCommandRegistry;
  for (let i = 0; i < usage.shapeCommandKeys.length; i++) {
    const kind = usage.shapeCommandKeys[i];
    if (commands?.has(kind) === true) {
      out?.push({ coverage: SceneCoverage.Satisfied, kind, registry: RenderRegistry.ShapeCommandHandler });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: SceneCoverage.Missing, kind, registry: RenderRegistry.ShapeCommandHandler });
  }

  return found;
}
