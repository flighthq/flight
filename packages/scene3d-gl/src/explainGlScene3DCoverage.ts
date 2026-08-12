import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type {
  CatalogRegistration,
  GlRenderState,
  Kind,
  Scene3DKindUsage,
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

// Clears `out`, then reports EVERY kind in `usage` with how well this state is wired for it — satisfied
// ones included, so one call is a complete manifest rather than only a list of complaints. The answering half
// of the scene↔render seam: @flighthq/scene3d says what a document uses, and this — the package that
// owns the GL registries — says which of those it can serve. The verdict reads the live registry;
// `catalog`, the caller's complete GL inventory, supplies the primary remedy only for a shortfall.
//
// Proactive, unlike explainRenderRegistryMisses, which reports what already missed during a frame. Ask
// this after loading a document and before the first draw, while the answer is still actionable.
//
// The debug-class tier: it allocates a gap per shortfall and distinguishes a downgrade from a total
// absence. For the frame-path question "is this state ready at all", call hasGlScene3DCoverage, which
// stops at the first shortfall and allocates nothing.
export function explainGlScene3DCoverage(
  out: SceneCoverageEntry[],
  state: GlRenderState,
  usage: Readonly<Scene3DKindUsage>,
  catalog: SceneCoverageCatalog,
): void {
  out.length = 0;
  collectGlScene3DCoverageGaps(out, state, usage, false, catalog);
}

// Whether this state can draw every kind `usage` names, counting a fallback as a shortfall — the
// authored material is not what would appear. Stops at the first shortfall and never allocates, so it
// is safe to call per load (or per frame) where explainGlScene3DCoverage would be too heavy. Use the
// explain form to find out WHICH kind and how badly.
export function hasGlScene3DCoverage(state: GlRenderState, usage: Readonly<Scene3DKindUsage>): boolean {
  return !collectGlScene3DCoverageGaps(null, state, usage, true, null);
}

// The single implementation both tiers read, so the boolean can never disagree with the explanation.
// `found` counts only real shortfalls, so appending satisfied entries to `out` never flips the predicate.
// Appends to `out` when it is non-null; returns whether any shortfall was found. `stopAtFirst` short
// circuits for the predicate, which is the only reason the boolean is cheaper than the explanation.
function collectGlScene3DCoverageGaps(
  out: SceneCoverageEntry[] | null,
  state: GlRenderState,
  usage: Readonly<Scene3DKindUsage>,
  stopAtFirst: boolean,
  catalog: SceneCoverageCatalog | null,
): boolean {
  let found = false;

  // drawScene3D resolves a subset's material by kind, then falls back to whatever is registered for
  // StandardMaterialKind, then skips the subset. So an unregistered kind may still draw — as the
  // standard material — which is a downgrade worth naming rather than a silence, and is NOT the same
  // as nothing being registered at all.
  const materials = getGlRenderStateRuntime(state).registries.meshMaterialRenderers.entries;
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

  // A texture whose source kind has no resolver samples nothing, so the map is simply absent from the
  // draw — the untextured-model failure this seam exists to surface before it reaches a frame.
  const resolvers = getGlRenderStateRuntime(state).registries.textureResolvers;
  for (let i = 0; i < usage.textureSourceKinds.length; i++) {
    const kind = usage.textureSourceKinds[i];
    if (resolvers.entries.get(kind)?.state === RegistryEntryState.Bound) {
      out?.push({
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneTextureSourceKind,
        kind,
        registry: RenderRegistry.TextureResolver,
      });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push(
      createShortfallEntry(
        catalog,
        false,
        RequirementFacet.SceneTextureSourceKind,
        kind,
        RenderRegistry.TextureResolver,
      ),
    );
  }

  // The shaded compiler assembles base + ordered modifiers into ONE program, so an unregistered
  // snippet does not fail a single lookup — it fails the whole material. A modifier kind is therefore
  // always a total absence, never a fallback.
  const snippets = getGlRenderStateRuntime(state).registries.modifierSnippets.entries;
  for (let i = 0; i < usage.modifierKinds.length; i++) {
    const kind = usage.modifierKinds[i];
    if (snippets.get(kind)?.state === RegistryEntryState.Bound) {
      out?.push({
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneModifierKind,
        kind,
        registry: RenderRegistry.ModifierSnippet,
      });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push(
      createShortfallEntry(catalog, false, RequirementFacet.SceneModifierKind, kind, RenderRegistry.ModifierSnippet),
    );
  }

  // usage.nodeKinds is deliberately NOT checked. The 3D pipeline collects meshes structurally
  // (`geometry != null` in collectVisibleMeshes) rather than through the node-renderer registry, so no
  // 3D node kind is registered against anything and reporting one would send a caller looking for a
  // registrar that does not exist. That the scene reports node kinds anyway is correct — deciding they
  // need nothing is this layer's call, not the scene's.
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
