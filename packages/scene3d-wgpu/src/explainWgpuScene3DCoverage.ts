import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { resolveModifier } from '@flighthq/shading/contract';
import type { Scene3DKindUsage, SceneCoverageEntry, WgpuRenderState } from '@flighthq/types/contract';
import { RenderRegistry, SceneCoverage, StandardMaterialKind } from '@flighthq/types/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';

// Clears `out`, then reports every kind in `usage` with how well this state is wired for it — satisfied
// ones included, so one call is a complete manifest. The WebGPU twin of explainGlScene3DCoverage, and
// the answering half of the scene↔render seam: @flighthq/scene3d says what a document uses, and this —
// the package that owns the WebGPU registries — says which of those it can serve.
//
// Proactive, unlike explainRenderRegistryMisses, which reports what already missed during a frame. Ask
// this after loading a document and before the first draw, while the answer is still actionable.
export function explainWgpuScene3DCoverage(
  out: SceneCoverageEntry[],
  state: WgpuRenderState,
  usage: Readonly<Scene3DKindUsage>,
): void {
  out.length = 0;
  collectWgpuScene3DCoverageGaps(out, state, usage, false);
}

// Whether this state can draw every kind `usage` names, counting a fallback as a shortfall — the
// authored material is not what would appear. Stops at the first shortfall and never allocates.
export function hasWgpuScene3DCoverage(state: WgpuRenderState, usage: Readonly<Scene3DKindUsage>): boolean {
  return !collectWgpuScene3DCoverageGaps(null, state, usage, true);
}

// The single implementation both tiers read, so the boolean can never disagree with the explanation.
// `found` counts only real shortfalls, so appending satisfied entries never flips the predicate.
function collectWgpuScene3DCoverageGaps(
  out: SceneCoverageEntry[] | null,
  state: WgpuRenderState,
  usage: Readonly<Scene3DKindUsage>,
  stopAtFirst: boolean,
): boolean {
  let found = false;

  // drawScene3D resolves a subset's material by kind, then falls back to whatever is registered for
  // StandardMaterialKind, then skips the subset. So an unregistered kind may still draw — as the
  // standard material — which is a downgrade worth naming rather than a silence.
  const materials = getWgpuScene3DRuntime(state).materialRegistry;
  const hasStandard = materials.has(StandardMaterialKind);
  for (let i = 0; i < usage.materialKinds.length; i++) {
    const kind = usage.materialKinds[i];
    if (materials.has(kind)) {
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

  // A texture whose source kind has no resolver samples nothing, so the map is simply absent from the
  // draw — the untextured-model failure this seam exists to surface before it reaches a frame.
  const resolvers = getWgpuRenderStateRuntime(state).wgpuTextureResolverRegistry;
  for (let i = 0; i < usage.textureSourceKinds.length; i++) {
    const kind = usage.textureSourceKinds[i];
    if (resolvers?.has(kind) === true) {
      out?.push({ coverage: SceneCoverage.Satisfied, kind, registry: RenderRegistry.TextureResolver });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: SceneCoverage.Missing, kind, registry: RenderRegistry.TextureResolver });
  }

  // The shaded compiler assembles base + ordered modifiers into ONE program, so an unregistered snippet
  // does not fail a single lookup — it fails the whole material. A modifier kind is therefore always
  // Missing, never a fallback.
  const snippets = getWgpuScene3DRuntime(state).modifierSnippetRegistry;
  for (let i = 0; i < usage.modifierKinds.length; i++) {
    const kind = usage.modifierKinds[i];
    if (snippets !== null && resolveModifier(snippets, kind) !== null) {
      out?.push({ coverage: SceneCoverage.Satisfied, kind, registry: RenderRegistry.ModifierSnippet });
      continue;
    }
    found = true;
    if (stopAtFirst) return true;
    out?.push({ coverage: SceneCoverage.Missing, kind, registry: RenderRegistry.ModifierSnippet });
  }

  // usage.nodeKinds is deliberately NOT checked. The 3D pipeline collects meshes structurally
  // (`geometry != null` in collectVisibleMeshes) rather than through the node-renderer registry, so no
  // 3D node kind is registered against anything and reporting one would send a caller looking for a
  // registrar that does not exist. That the scene reports node kinds anyway is correct — deciding they
  // need nothing is this layer's call, not the scene's.
  return found;
}
