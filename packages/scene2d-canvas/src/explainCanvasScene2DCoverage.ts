import { explainScene2DCoverage, hasScene2DCoverage } from '@flighthq/render/contract';
import type {
  CanvasRenderState,
  CatalogRegistration,
  Kind,
  Scene2DKindUsage,
  SceneCoverageCatalog,
  SceneCoverageEntry,
} from '@flighthq/types/contract';
import { RenderRegistry, RequirementFacet, SceneCoverage } from '@flighthq/types/contract';

import { getCanvasMaterialRenderer } from './canvasMaterialRegistry';

// Clears `out`, then reports every requirement in `usage` with how well this Canvas state is wired for
// it — satisfied entries included, so one call is a complete manifest.
//
// Composes rather than restates: the node-renderer and shape-command registries live on the base render
// state and are answered by explainScene2DCoverage for every backend alike, so this appends only what is
// Canvas's own. There is no blend half — Canvas composites every blend mode natively through
// globalCompositeOperation, with nothing to register. `catalog` is the complete Canvas inventory and
// is passed through to the shared half as well as used for Canvas remedies.
export function explainCanvasScene2DCoverage(
  out: SceneCoverageEntry[],
  state: CanvasRenderState,
  usage: Readonly<Scene2DKindUsage>,
  catalog: SceneCoverageCatalog,
): void {
  explainScene2DCoverage(out, state, usage, catalog);
  collectCanvasScene2DCoverageGaps(out, state, usage, false, catalog);
}

// Whether this state can serve everything `usage` names, Canvas specifics included. Stops at the first
// shortfall and never allocates. Use the explain form to find out WHICH requirement and how badly.
export function hasCanvasScene2DCoverage(state: CanvasRenderState, usage: Readonly<Scene2DKindUsage>): boolean {
  if (!hasScene2DCoverage(state, usage)) return false;
  return !collectCanvasScene2DCoverageGaps(null, state, usage, true, null);
}

// Appends the Canvas-only half. `found` counts only real shortfalls, so appending satisfied entries
// never flips the predicate.
function collectCanvasScene2DCoverageGaps(
  out: SceneCoverageEntry[] | null,
  state: CanvasRenderState,
  usage: Readonly<Scene2DKindUsage>,
  stopAtFirst: boolean,
  catalog: SceneCoverageCatalog | null,
): boolean {
  let found = false;

  // Always a fallback state, never a total absence — the opposite of the GPU backends. A Canvas material only
  // contributes extra draw state (composite, filter) on top of a draw the node renderer already
  // performs, so an unregistered kind means the node still appears, without the material's
  // contribution. Nothing vanishes, so this is a downgrade to name rather than a failure to block on.
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (getCanvasMaterialRenderer(state, kind) !== null) {
      out?.push({
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneMaterialKind,
        kind,
        registry: RenderRegistry.MaterialRenderer,
      });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push(
      createShortfallEntry(catalog, true, RequirementFacet.SceneMaterialKind, kind, RenderRegistry.MaterialRenderer),
    );
  }

  return found;
}

function createShortfallEntry(
  catalog: SceneCoverageCatalog | null,
  fallback: boolean,
  facet: SceneCoverageEntry['facet'],
  kind: Kind,
  registry: SceneCoverageEntry['registry'],
): SceneCoverageEntry {
  const registration = findCatalogRegistration(catalog, kind, registry);
  const base = { facet, kind, registry };
  if (registration === null) {
    return {
      ...base,
      coverage: fallback ? SceneCoverage.FallbackUnavailable : SceneCoverage.Unavailable,
    };
  }
  return {
    ...base,
    coverage: fallback ? SceneCoverage.FallbackRemediable : SceneCoverage.Unregistered,
    module: registration.module,
    registrar: registration.registrar,
  };
}

function findCatalogRegistration(
  catalog: SceneCoverageCatalog | null,
  kind: Kind,
  registry: SceneCoverageEntry['registry'],
): CatalogRegistration | null {
  if (catalog === null) return null;
  for (const entry of catalog) {
    if (entry.kind === kind && entry.registry === registry) return entry.registrations[0] ?? null;
  }
  return null;
}
