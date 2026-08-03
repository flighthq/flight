import type { RenderBackend, Scene3DRequirement } from '@flighthq/types/contract';
import { Scene3DRegistry } from '@flighthq/types/contract';

// Renders the requirement list as the block a caller transcribes into its own setup code: one line per
// binding, each naming the actual function to call. The separately importable text module for
// `getScene3DRequirements`, holding every word the query deliberately does not — the same split
// `renderRegistryGuards` makes between the RenderRegistry enum and its miss messages, and the reason a
// production bundle that never formats carries no prose.
//
// `backend` selects which registrar family the render-side lines name, because the backend token
// prefixes the type in every registrar (`Gl` + `ShadedMaterial` → `registerGlShadedMaterial`) — a law
// scripts/backendPrefix.ts enforces repo-wide, so a name derived from the token here cannot drift out
// of sync with the registrars the way a hand-written table of call names would.
//
// The header states there is no register-all on purpose. Reading a list of missing registrations and
// concluding that the SDK should expose one convenience barrel is the exact trade this list exists to
// avoid: an assembly must never inflate the bundle cost of a primitive.
export function formatScene3DRequirements(
  requirements: readonly Readonly<Scene3DRequirement>[],
  backend: RenderBackend,
): string {
  if (requirements.length === 0) return 'Scene3D content requires no registrations.';
  const lines = [
    `Scene3D content requires ${requirements.length} registration(s) for the ${backend} backend.`,
    'There is no register-all — call each one explicitly so the rest stays out of the bundle.',
  ];
  for (let i = 0; i < requirements.length; i++) {
    lines.push(`  ${formatOneScene3DRequirement(requirements[i], backend)}`);
  }
  return lines.join('\n');
}

function formatOneScene3DRequirement(requirement: Readonly<Scene3DRequirement>, backend: RenderBackend): string {
  const key = requirement.key;
  switch (requirement.registry) {
    case Scene3DRegistry.ImageDecoder:
      return `image decoder for '${key}' — call registerImageDecoder('${key}', decoder), or registerWebImageDecoders() for the built-in web set`;
    // A backend that does not implement the kind degrades it to StandardMaterialKind rather than
    // erroring (see Material), so the absence of this registrar is a downgrade, not a crash.
    case Scene3DRegistry.MaterialRenderer:
      return `material renderer for '${key}' — call register${backend}${key}(state); without it this material degrades to the standard material on this backend`;
    // Named as the open primitive rather than the per-kind convenience, because the generic call is
    // correct for every kind including a vendor-prefixed one, and built-in listers do not share a
    // single derivable name.
    case Scene3DRegistry.MaterialTextureLister:
      return `material texture lister for '${key}' — call registerScene3DMaterialTextures(registry, '${key}', lister); only needed to resolve image resources or to fade nodes in with revealScene3DResourcesOnResolve`;
    case Scene3DRegistry.ModifierSnippet:
      return hasScene3DModifierSnippets(backend)
        ? `shader snippet for modifier '${key}' — call register${backend}ModifierSnippet(state, '${key}', snippet), or registerBuiltIn${backend}ModifierSnippets(state) for the built-in set`
        : `shader snippet for modifier '${key}' — UNAVAILABLE on the ${backend} backend, which compiles no shaders; this material's modifier stack cannot be honored here`;
    case Scene3DRegistry.ShadingModifier:
      return `modifier '${key}' — call registerModifier(registry, ...) on a createModifierRegistry(), or registerBuiltInModifiers(registry) for the built-in set`;
    // Canvas resolves through a caller-owned resolver set rather than a render state, and only the two
    // GPU backends ship a Standard* convenience — naming one for Canvas or DOM would send a caller
    // hunting for a function that does not exist.
    case Scene3DRegistry.TextureResolver:
      if (backend === 'Canvas')
        return `texture resolver for source kind '${key}' — call registerCanvasTextureResolver(resolvers, '${key}', resolver) on the set the caller resolves through`;
      if (backend === 'Dom')
        return `texture resolver for source kind '${key}' — call registerDomTextureResolver(state, '${key}', resolver)`;
      return `texture resolver for source kind '${key}' — call register${backend}TextureResolver(state, '${key}', resolver), or registerStandard${backend}TextureResolvers(state) for the built-in set`;
  }
}

// Only Gl and Wgpu compile shader snippets, so a modifier stack cannot be honored on Canvas or DOM at
// all. Naming a registrar that does not exist would send a caller hunting for it, so the line reports
// the gap instead.
function hasScene3DModifierSnippets(backend: RenderBackend): boolean {
  return backend === 'Gl' || backend === 'Wgpu';
}
