import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { explainScene2DCoverage, hasScene2DCoverage } from '@flighthq/render/contract';
import type {
  CatalogRegistration,
  GlRenderState,
  Kind,
  Scene2DKindUsage,
  SceneCoverageCatalog,
  SceneCoverageEntry,
} from '@flighthq/types/contract';
import {
  RegistryEntryState,
  RenderRegistry,
  RequirementFacet,
  SceneCoverage,
  StandardMaterialKind,
} from '@flighthq/types/contract';

// Clears `out`, then reports every requirement in `usage` with how well this GL state is wired for it —
// satisfied entries included, so one call is a complete manifest.
//
// Composes rather than restates: the node-renderer and shape-command registries live on the base render
// state and are answered by explainScene2DCoverage for every backend alike, so this appends only what is
// GL's own — blend realizations and 2D material renderers. `catalog` is the complete GL inventory and
// is passed through to the shared half as well as used for GL remedies.
export function explainGlScene2DCoverage(
  out: SceneCoverageEntry[],
  state: GlRenderState,
  usage: Readonly<Scene2DKindUsage>,
  catalog: SceneCoverageCatalog,
): void {
  explainScene2DCoverage(out, state, usage, catalog);
  collectGlScene2DCoverageGaps(out, state, usage, false, catalog);
}

// Whether this state can serve everything `usage` names, GL specifics included. Stops at the first
// shortfall and never allocates. Use the explain form to find out WHICH requirement and how badly.
export function hasGlScene2DCoverage(state: GlRenderState, usage: Readonly<Scene2DKindUsage>): boolean {
  if (!hasScene2DCoverage(state, usage)) return false;
  return !collectGlScene2DCoverageGaps(null, state, usage, true, null);
}

// Appends the GL-only half. `found` counts only real shortfalls, so appending satisfied entries never
// flips the predicate.
function collectGlScene2DCoverageGaps(
  out: SceneCoverageEntry[] | null,
  state: GlRenderState,
  usage: Readonly<Scene2DKindUsage>,
  stopAtFirst: boolean,
  catalog: SceneCoverageCatalog | null,
): boolean {
  let found = false;
  const runtime = getGlRenderStateRuntime(state);

  // GL composites through an explicit per-mode realization; an unregistered mode falls back to normal
  // compositing, so the node still draws but not as authored. Canvas and DOM express these natively and
  // report nothing here, which is why this half is GL's and not the shared check's.
  const blendModes = runtime.registries.blendRealizations.entries;
  for (let i = 0; i < usage.blendModes.length; i++) {
    const kind = usage.blendModes[i];
    if (blendModes.get(kind)?.state === RegistryEntryState.Bound) {
      out?.push({
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneBlendMode,
        kind,
        registry: RenderRegistry.BlendRealization,
      });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push(
      createShortfallEntry(catalog, true, RequirementFacet.SceneBlendMode, kind, RenderRegistry.BlendRealization),
    );
  }

  // resolveGlMaterialRenderer falls back to whatever is registered for StandardMaterialKind, so an
  // unregistered kind may still draw — as the standard material, which is a downgrade worth naming
  // rather than a silence, and is NOT the same as nothing being registered at all.
  const materials = runtime.registries.materialRenderers.entries;
  const hasStandard = materials.get(StandardMaterialKind)?.state === RegistryEntryState.Bound;
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (materials.get(kind)?.state === RegistryEntryState.Bound) {
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
      createShortfallEntry(
        catalog,
        hasStandard,
        RequirementFacet.SceneMaterialKind,
        kind,
        RenderRegistry.MaterialRenderer,
      ),
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
