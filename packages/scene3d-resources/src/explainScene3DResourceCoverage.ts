import type {
  CatalogRegistration,
  Kind,
  Scene3DKindUsage,
  Scene3DResourceResolver,
  SceneCoverageCatalog,
  SceneCoverageEntry,
} from '@flighthq/types/contract';
import { RenderRegistry, RequirementFacet, SceneCoverage } from '@flighthq/types/contract';

import { hasScene3DMaterialTextureLister } from './sceneMaterialTextureRegistry';

// Clears `out`, then reports EVERY material kind in `usage` with how well this resolver describes it —
// satisfied ones included, so one call is a complete manifest rather than only a list of complaints. The resource
// layer's half of the scene↔consumer seam: @flighthq/scene3d says what a document uses, each holder of a
// registry answers for its own. The verdict reads the live registry; `catalog`, the caller's complete
// resource inventory, supplies the primary remedy only for a shortfall.
//
// Ask it after parsing and before loading, while the answer is still actionable.
//
// A gap here is always a total absence, never a fallback: the registry has no default lister, so an unlisted kind
// contributes nothing rather than something approximate. Image acquisition is unaffected because
// getScene3DResourceTextures reads the resource back-edge without consulting this registry. Consumers
// that need mesh→texture ownership see only listed families. When every material on a mesh is unlisted,
// reveal-on-resolve leaves its starting alpha unchanged and installs no fade. When a listed sibling has
// pending textures, the recipe hides the mesh but waits only for those listed textures; it can reveal the
// mesh while an unlisted material's texture is still pending, so that texture may pop in later.
export function explainScene3DResourceCoverage(
  out: SceneCoverageEntry[],
  resolver: Readonly<Scene3DResourceResolver>,
  usage: Readonly<Scene3DKindUsage>,
  catalog: SceneCoverageCatalog,
): void {
  out.length = 0;
  collectScene3DResourceCoverageGaps(out, resolver, usage, false, catalog);
}

// Whether this resolver can describe every material kind `usage` names. Stops at the first gap and
// never allocates, so it is cheap enough to call per load. Use the explain form to find out WHICH kind.
export function hasScene3DResourceCoverage(
  resolver: Readonly<Scene3DResourceResolver>,
  usage: Readonly<Scene3DKindUsage>,
): boolean {
  return !collectScene3DResourceCoverageGaps(null, resolver, usage, true, null);
}

// The single implementation both tiers read, so the boolean can never disagree with the explanation.
// `found` counts only real shortfalls, so appending satisfied entries to `out` never flips the predicate.
function collectScene3DResourceCoverageGaps(
  out: SceneCoverageEntry[] | null,
  resolver: Readonly<Scene3DResourceResolver>,
  usage: Readonly<Scene3DKindUsage>,
  stopAtFirst: boolean,
  catalog: SceneCoverageCatalog | null,
): boolean {
  let found = false;
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (hasScene3DMaterialTextureLister(resolver.registry, kind)) {
      out?.push({
        coverage: SceneCoverage.Satisfied,
        facet: RequirementFacet.SceneMaterialKind,
        kind,
        registry: RenderRegistry.MaterialTextureLister,
      });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push(
      createShortfallEntry(
        catalog,
        false,
        RequirementFacet.SceneMaterialKind,
        kind,
        RenderRegistry.MaterialTextureLister,
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
