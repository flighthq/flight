//! The proactive WebGPU 3D coverage seam (TS `explainWgpuScene3DCoverage.ts`): which of the kinds a
//! document uses this state's registries can serve, the WebGPU twin of the GL explanation.

use flight_entity::Kind;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_render::{
    CatalogRegistration, RenderRegistryTable, SceneCoverage, SceneCoverageCatalog,
    SceneCoverageEntry,
};
use flight_render_wgpu::{WgpuRenderState, get_wgpu_render_state_runtime};
use flight_requirement::RequirementFacet;
use flight_scene3d::Scene3DKindUsage;

fn create_satisfied_entry(
    facet: RequirementFacet,
    kind: &Kind,
    registry: RenderRegistryTable,
) -> SceneCoverageEntry {
    return SceneCoverageEntry {
        coverage: SceneCoverage::Satisfied,
        facet,
        kind: kind.clone(),
        registry,
        module: None,
        registrar: None,
    };
}

fn create_shortfall_entry(
    catalog: Option<&SceneCoverageCatalog>,
    fallback: bool,
    facet: RequirementFacet,
    kind: &Kind,
    registry: RenderRegistryTable,
) -> SceneCoverageEntry {
    let Some(registration) = find_catalog_registration(catalog, kind, registry) else {
        return SceneCoverageEntry {
            coverage: if fallback {
                SceneCoverage::FallbackUnavailable
            } else {
                SceneCoverage::Unavailable
            },
            facet,
            kind: kind.clone(),
            registry,
            module: None,
            registrar: None,
        };
    };
    return SceneCoverageEntry {
        coverage: if fallback {
            SceneCoverage::FallbackRemediable
        } else {
            SceneCoverage::Unregistered
        },
        facet,
        kind: kind.clone(),
        registry,
        module: Some(registration.module.clone()),
        registrar: Some(registration.registrar.clone()),
    };
}

// The single implementation both tiers read, so the boolean never disagrees with the explanation.
// Node kinds are deliberately not checked: 3D collects meshes structurally, not through the
// node-renderer registry.
fn collect_wgpu_scene3d_coverage_gaps(
    mut out: Option<&mut Vec<SceneCoverageEntry>>,
    state: &WgpuRenderState,
    usage: &Scene3DKindUsage,
    stop_at_first: bool,
    catalog: Option<&SceneCoverageCatalog>,
) -> bool {
    let mut found = false;
    let registries = &get_wgpu_render_state_runtime(state).registries;

    // An unregistered material kind may still draw as the standard material, a downgrade worth naming.
    let materials = &registries.material_renderers.entries;
    let has_standard = materials.contains_key(STANDARD_MATERIAL_KIND);
    for kind in &usage.material_kinds {
        if materials.contains_key(kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(create_satisfied_entry(
                    RequirementFacet::SceneMaterialKind,
                    kind,
                    RenderRegistryTable::MaterialRenderer,
                ));
            }
            continue;
        }
        found = true;
        if stop_at_first {
            return true;
        }
        if let Some(out) = out.as_deref_mut() {
            out.push(create_shortfall_entry(
                catalog,
                has_standard,
                RequirementFacet::SceneMaterialKind,
                kind,
                RenderRegistryTable::MaterialRenderer,
            ));
        }
    }

    // A texture whose source kind has no resolver samples nothing.
    let resolvers = &registries.texture_resolvers.entries;
    for kind in &usage.texture_source_kinds {
        if resolvers.contains_key(kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(create_satisfied_entry(
                    RequirementFacet::SceneTextureSourceKind,
                    kind,
                    RenderRegistryTable::TextureResolver,
                ));
            }
            continue;
        }
        found = true;
        if stop_at_first {
            return true;
        }
        if let Some(out) = out.as_deref_mut() {
            out.push(create_shortfall_entry(
                catalog,
                false,
                RequirementFacet::SceneTextureSourceKind,
                kind,
                RenderRegistryTable::TextureResolver,
            ));
        }
    }

    // The shaded compiler assembles base + modifiers into one program, so an unregistered snippet
    // fails the whole material: always a total absence, never a fallback.
    let snippets = &registries.modifier_snippets.entries;
    for kind in &usage.modifier_kinds {
        if snippets.contains_key(kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(create_satisfied_entry(
                    RequirementFacet::SceneModifierKind,
                    kind,
                    RenderRegistryTable::ModifierSnippet,
                ));
            }
            continue;
        }
        found = true;
        if stop_at_first {
            return true;
        }
        if let Some(out) = out.as_deref_mut() {
            out.push(create_shortfall_entry(
                catalog,
                false,
                RequirementFacet::SceneModifierKind,
                kind,
                RenderRegistryTable::ModifierSnippet,
            ));
        }
    }
    return found;
}

/// Clears `out`, then reports every kind in `usage` with how well this state is wired for it,
/// satisfied ones included (TS `explainWgpuScene3DCoverage`). The verdict reads the live registries;
/// `catalog` supplies the primary remedy only for a shortfall.
pub fn explain_wgpu_scene3d_coverage(
    out: &mut Vec<SceneCoverageEntry>,
    state: &WgpuRenderState,
    usage: &Scene3DKindUsage,
    catalog: &SceneCoverageCatalog,
) {
    out.clear();
    collect_wgpu_scene3d_coverage_gaps(Some(out), state, usage, false, Some(catalog));
}

fn find_catalog_registration<'a>(
    catalog: Option<&'a SceneCoverageCatalog>,
    kind: &str,
    registry: RenderRegistryTable,
) -> Option<&'a CatalogRegistration> {
    return catalog?
        .iter()
        .find(|entry| entry.kind == kind && entry.registry == registry)?
        .registrations
        .first();
}

/// Whether this state can draw every kind `usage` names, counting a standard-material fallback as a
/// shortfall (TS `hasWgpuScene3DCoverage`). Stops at the first shortfall.
pub fn has_wgpu_scene3d_coverage(state: &WgpuRenderState, usage: &Scene3DKindUsage) -> bool {
    return !collect_wgpu_scene3d_coverage_gaps(None, state, usage, true, None);
}
