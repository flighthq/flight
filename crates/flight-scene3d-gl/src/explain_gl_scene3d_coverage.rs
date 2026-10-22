use flight_entity::Kind;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_render::{
    CatalogRegistration, RenderRegistryTable, SceneCoverage, SceneCoverageCatalog,
    SceneCoverageEntry,
};
use flight_render_gl::GlRenderState;
use flight_requirement::RequirementFacet;
use flight_scene3d::Scene3DKindUsage;

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

// The single implementation both tiers read, so the boolean can never disagree with the explanation.
// `found` counts only real shortfalls, so appending satisfied entries to `out` never flips the
// predicate. Appends to `out` when it is present; returns whether any shortfall was found.
// `stop_at_first` short-circuits for the predicate.
fn collect_gl_scene3d_coverage_gaps(
    mut out: Option<&mut Vec<SceneCoverageEntry>>,
    state: &GlRenderState,
    usage: &Scene3DKindUsage,
    stop_at_first: bool,
    catalog: Option<&SceneCoverageCatalog>,
) -> bool {
    let mut found = false;

    // render_gl_scene3d resolves a subset's material by kind, then falls back to whatever is
    // registered for StandardMaterialKind, then skips the subset. So an unregistered kind may still
    // draw — as the standard material — a downgrade worth naming, not the same as total absence.
    let materials = &state.gl_registries.material_renderers.entries;
    let has_standard = materials.contains_key(STANDARD_MATERIAL_KIND);
    for kind in &usage.material_kinds {
        if materials.contains_key(kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(satisfied_entry(
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

    // A texture whose source kind has no resolver samples nothing, so the map is simply absent.
    let resolvers = &state.gl_registries.texture_resolvers.entries;
    for kind in &usage.texture_source_kinds {
        if resolvers.contains_key(kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(satisfied_entry(
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

    // The shaded compiler assembles base + ordered modifiers into ONE program, so an unregistered
    // snippet fails the whole material: a modifier kind is always a total absence, never a fallback.
    let snippets = &state.gl_registries.modifier_snippets.entries;
    for kind in &usage.modifier_kinds {
        if snippets.contains_key(kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(satisfied_entry(
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

    // usage.node_kinds is deliberately NOT checked: the 3D pipeline collects meshes structurally rather
    // than through the node-renderer registry, so no 3D node kind is registered against anything.
    return found;
}

// Clears `out`, then reports EVERY kind in `usage` with how well this state is wired for it —
// satisfied ones included, so one call is a complete manifest. The verdict reads the live registry;
// `catalog`, the caller's complete GL inventory, supplies the primary remedy only for a shortfall. Ask
// this after loading a document and before the first draw. For the frame-path question "is this state
// ready at all", call has_gl_scene3d_coverage, which stops at the first shortfall and allocates nothing.
pub fn explain_gl_scene3d_coverage(
    out: &mut Vec<SceneCoverageEntry>,
    state: &GlRenderState,
    usage: &Scene3DKindUsage,
    catalog: &SceneCoverageCatalog,
) {
    out.clear();
    collect_gl_scene3d_coverage_gaps(Some(out), state, usage, false, Some(catalog));
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

// Whether this state can draw every kind `usage` names, counting a fallback as a shortfall — the
// authored material is not what would appear. Stops at the first shortfall and never allocates.
pub fn has_gl_scene3d_coverage(state: &GlRenderState, usage: &Scene3DKindUsage) -> bool {
    return !collect_gl_scene3d_coverage_gaps(None, state, usage, true, None);
}

fn satisfied_entry(
    facet: RequirementFacet,
    kind: &str,
    registry: RenderRegistryTable,
) -> SceneCoverageEntry {
    return SceneCoverageEntry {
        coverage: SceneCoverage::Satisfied,
        facet,
        kind: kind.to_string(),
        registry,
        module: None,
        registrar: None,
    };
}
