import type { Scene3DCoverageGap, Scene3DKindUsage, Scene3DResourceResolver } from '@flighthq/types/contract';
import { RenderRegistry, Scene3DCoverage } from '@flighthq/types/contract';

import { hasScene3DMaterialTextureLister } from './sceneMaterialTextureRegistry';

// Clears `out`, then reports every material kind in `usage` this resolver cannot describe. The resource
// layer's half of the scene↔consumer seam: @flighthq/scene3d says what a document uses, each holder of a
// registry answers for its own. It reads the registry rather than a table of names, so it cannot go
// stale against a registrar rename.
//
// Ask it after parsing and before loading, while the answer is still actionable.
//
// A gap here is always Missing, never Fallback: the registry has no default lister, so an unlisted kind
// contributes nothing rather than something approximate. Note this no longer affects which images get
// fetched — getScene3DResourceTextures reads the resource back-edge and is registry-free — so the cost
// of a gap is confined to consumers that need mesh→texture ownership, chiefly the reveal-on-resolve
// recipe, whose meshes would wait for an event that never names them.
export function explainScene3DResourceCoverage(
  out: Scene3DCoverageGap[],
  resolver: Readonly<Scene3DResourceResolver>,
  usage: Readonly<Scene3DKindUsage>,
): void {
  out.length = 0;
  collectScene3DResourceCoverageGaps(out, resolver, usage, false);
}

// Whether this resolver can describe every material kind `usage` names. Stops at the first gap and
// never allocates, so it is cheap enough to call per load. Use the explain form to find out WHICH kind.
export function hasScene3DResourceCoverage(
  resolver: Readonly<Scene3DResourceResolver>,
  usage: Readonly<Scene3DKindUsage>,
): boolean {
  return !collectScene3DResourceCoverageGaps(null, resolver, usage, true);
}

// The single implementation both tiers read, so the boolean can never disagree with the explanation.
function collectScene3DResourceCoverageGaps(
  out: Scene3DCoverageGap[] | null,
  resolver: Readonly<Scene3DResourceResolver>,
  usage: Readonly<Scene3DKindUsage>,
  stopAtFirst: boolean,
): boolean {
  let found = false;
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (hasScene3DMaterialTextureLister(resolver.registry, kind)) continue;
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: Scene3DCoverage.Missing, kind, registry: RenderRegistry.MaterialTextureLister });
  }
  return found;
}
