import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { resolveModifier } from '@flighthq/shading/contract';
import type { GlRenderState, Scene3DCoverageGap, Scene3DKindUsage } from '@flighthq/types/contract';
import { RenderRegistry, Scene3DCoverage, StandardMaterialKind } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';

// Clears `out`, then reports every kind in `usage` this state is not wired to draw. The answering half
// of the scene↔render seam: @flighthq/scene3d says what a document uses, and this — the package that
// owns the GL registries — says which of those it can serve. Neither package knows the other's
// internals, and this cannot go stale against a registrar rename because it reads the registries
// themselves rather than a table of names.
//
// Proactive, unlike explainRenderRegistryMisses, which reports what already missed during a frame. Ask
// this after loading a document and before the first draw, while the answer is still actionable.
//
// The debug-class tier: it allocates a gap per shortfall and distinguishes a downgrade from a total
// absence. For the frame-path question "is this state ready at all", call hasGlScene3DCoverage, which
// stops at the first shortfall and allocates nothing.
export function explainGlScene3DCoverage(
  out: Scene3DCoverageGap[],
  state: GlRenderState,
  usage: Readonly<Scene3DKindUsage>,
): void {
  out.length = 0;
  collectGlScene3DCoverageGaps(out, state, usage, false);
}

// Whether this state can draw every kind `usage` names, counting a fallback as a shortfall — the
// authored material is not what would appear. Stops at the first shortfall and never allocates, so it
// is safe to call per load (or per frame) where explainGlScene3DCoverage would be too heavy. Use the
// explain form to find out WHICH kind and how badly.
export function hasGlScene3DCoverage(state: GlRenderState, usage: Readonly<Scene3DKindUsage>): boolean {
  return !collectGlScene3DCoverageGaps(null, state, usage, true);
}

// The single implementation both tiers read, so the boolean can never disagree with the explanation.
// Appends to `out` when it is non-null; returns whether any shortfall was found. `stopAtFirst` short
// circuits for the predicate, which is the only reason the boolean is cheaper than the explanation.
function collectGlScene3DCoverageGaps(
  out: Scene3DCoverageGap[] | null,
  state: GlRenderState,
  usage: Readonly<Scene3DKindUsage>,
  stopAtFirst: boolean,
): boolean {
  let found = false;

  // drawScene3D resolves a subset's material by kind, then falls back to whatever is registered for
  // StandardMaterialKind, then skips the subset. So an unregistered kind may still draw — as the
  // standard material — which is a downgrade worth naming rather than a silence, and is NOT the same
  // as nothing being registered at all.
  const materials = getGlScene3DRuntime(state).materialRegistry;
  const hasStandard = materials.has(StandardMaterialKind);
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (materials.has(kind)) continue;
    found = true;
    if (stopAtFirst) return true;
    out?.push({
      coverage: hasStandard ? Scene3DCoverage.Fallback : Scene3DCoverage.Missing,
      kind,
      registry: RenderRegistry.MaterialRenderer,
    });
  }

  // A texture whose source kind has no resolver samples nothing, so the map is simply absent from the
  // draw — the untextured-model failure this seam exists to surface before it reaches a frame.
  const resolvers = getGlRenderStateRuntime(state).glTextureResolverRegistry;
  for (let i = 0; i < usage.textureSourceKinds.length; i++) {
    const kind = usage.textureSourceKinds[i];
    if (resolvers?.has(kind) === true) continue;
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: Scene3DCoverage.Missing, kind, registry: RenderRegistry.TextureResolver });
  }

  // The shaded compiler assembles base + ordered modifiers into ONE program, so an unregistered
  // snippet does not fail a single lookup — it fails the whole material. A modifier kind is therefore
  // always Missing, never a fallback.
  const snippets = getGlScene3DRuntime(state).modifierSnippetRegistry;
  for (let i = 0; i < usage.modifierKinds.length; i++) {
    const kind = usage.modifierKinds[i];
    if (snippets !== null && resolveModifier(snippets, kind) !== null) continue;
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: Scene3DCoverage.Missing, kind, registry: RenderRegistry.ModifierSnippet });
  }

  // usage.nodeKinds is deliberately NOT checked. The 3D pipeline collects meshes structurally
  // (`geometry != null` in collectVisibleMeshes) rather than through the node-renderer registry, so no
  // 3D node kind is registered against anything and reporting one would send a caller looking for a
  // registrar that does not exist. That the scene reports node kinds anyway is correct — deciding they
  // need nothing is this layer's call, not the scene's.
  return found;
}
