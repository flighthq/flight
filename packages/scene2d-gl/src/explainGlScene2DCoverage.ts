import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { explainScene2DCoverage, hasScene2DCoverage } from '@flighthq/render/contract';
import type { GlRenderState, Scene2DKindUsage, SceneCoverageEntry } from '@flighthq/types/contract';
import { RenderRegistry, SceneCoverage, StandardMaterialKind } from '@flighthq/types/contract';

// Clears `out`, then reports every requirement in `usage` with how well this GL state is wired for it —
// satisfied entries included, so one call is a complete manifest.
//
// Composes rather than restates: the node-renderer and shape-command registries live on the base render
// state and are answered by explainScene2DCoverage for every backend alike, so this appends only what is
// GL's own — blend realizations and 2D material renderers.
export function explainGlScene2DCoverage(
  out: SceneCoverageEntry[],
  state: GlRenderState,
  usage: Readonly<Scene2DKindUsage>,
): void {
  explainScene2DCoverage(out, state, usage);
  collectGlScene2DCoverageGaps(out, state, usage, false);
}

// Whether this state can serve everything `usage` names, GL specifics included. Stops at the first
// shortfall and never allocates. Use the explain form to find out WHICH requirement and how badly.
export function hasGlScene2DCoverage(state: GlRenderState, usage: Readonly<Scene2DKindUsage>): boolean {
  if (!hasScene2DCoverage(state, usage)) return false;
  return !collectGlScene2DCoverageGaps(null, state, usage, true);
}

// Appends the GL-only half. `found` counts only real shortfalls, so appending satisfied entries never
// flips the predicate.
function collectGlScene2DCoverageGaps(
  out: SceneCoverageEntry[] | null,
  state: GlRenderState,
  usage: Readonly<Scene2DKindUsage>,
  stopAtFirst: boolean,
): boolean {
  let found = false;
  const runtime = getGlRenderStateRuntime(state);

  // GL composites through an explicit per-mode realization; an unregistered mode falls back to normal
  // compositing, so the node still draws but not as authored. Canvas and DOM express these natively and
  // report nothing here, which is why this half is GL's and not the shared check's.
  const blendModes = runtime.glBlendModeRegistry;
  for (let i = 0; i < usage.blendModes.length; i++) {
    const kind = usage.blendModes[i];
    if (blendModes?.has(kind) === true) {
      out?.push({ coverage: SceneCoverage.Satisfied, kind, registry: RenderRegistry.BlendRealization });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: SceneCoverage.Fallback, kind, registry: RenderRegistry.BlendRealization });
  }

  // resolveGlMaterialRenderer falls back to whatever is registered for StandardMaterialKind, so an
  // unregistered kind may still draw — as the standard material, which is a downgrade worth naming
  // rather than a silence, and is NOT the same as nothing being registered at all.
  const materials = runtime.materialRendererMap;
  const hasStandard = materials?.has(StandardMaterialKind) === true;
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (materials?.has(kind) === true) {
      out?.push({ coverage: SceneCoverage.Satisfied, kind, registry: RenderRegistry.MaterialRenderer });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push({
      coverage: hasStandard ? SceneCoverage.Fallback : SceneCoverage.Missing,
      kind,
      registry: RenderRegistry.MaterialRenderer,
    });
  }

  return found;
}
