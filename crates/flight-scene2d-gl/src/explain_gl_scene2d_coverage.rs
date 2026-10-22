use flight_entity::Kind;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_render::{
    CatalogRegistration, RenderRegistryTable, SceneCoverage, SceneCoverageCatalog,
    SceneCoverageEntry, explain_scene_2d_coverage, has_scene_2d_coverage,
};
use flight_render_gl::GlRenderState;
use flight_requirement::RequirementFacet;
use flight_scene2d::Scene2DKindUsage;

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

// Appends the GL-only half. `found` counts only real shortfalls, so appending satisfied entries
// never flips the predicate.
fn collect_gl_scene2d_coverage_gaps(
    mut out: Option<&mut Vec<SceneCoverageEntry>>,
    state: &GlRenderState,
    usage: &Scene2DKindUsage,
    stop_at_first: bool,
    catalog: Option<&SceneCoverageCatalog>,
) -> bool {
    let mut found = false;

    // GL composites through an explicit per-mode realization; an unregistered mode falls back to
    // normal compositing, so the node still draws but not as authored.
    let blend_modes = &state.gl_registries.blend_realizations.entries;
    for kind in &usage.blend_modes {
        if blend_modes.contains_key(kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(satisfied_entry(
                    RequirementFacet::SceneBlendMode,
                    kind,
                    RenderRegistryTable::BlendRealization,
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
                true,
                RequirementFacet::SceneBlendMode,
                kind,
                RenderRegistryTable::BlendRealization,
            ));
        }
    }

    // resolve_gl_quad_material_renderer falls back to whatever is registered for
    // STANDARD_MATERIAL_KIND, so an unregistered kind may still draw — as the standard material,
    // which is a downgrade worth naming rather than a silence.
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

    return found;
}

// Clears `out`, then reports every requirement in `usage` with how well this GL state is wired for
// it — satisfied entries included, so one call is a complete manifest. The node-renderer and
// shape-command registries are answered by explain_scene_2d_coverage for every backend alike; this
// appends only what is GL's own — blend realizations and 2D material renderers.
pub fn explain_gl_scene2d_coverage(
    out: &mut Vec<SceneCoverageEntry>,
    state: &GlRenderState,
    usage: &Scene2DKindUsage,
    catalog: &SceneCoverageCatalog,
) {
    explain_scene_2d_coverage(out, state, usage, catalog);
    collect_gl_scene2d_coverage_gaps(Some(out), state, usage, false, Some(catalog));
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

// Whether this state can serve everything `usage` names, GL specifics included. Stops at the first
// shortfall and never allocates.
pub fn has_gl_scene2d_coverage(state: &GlRenderState, usage: &Scene2DKindUsage) -> bool {
    if !has_scene_2d_coverage(state, usage) {
        return false;
    }
    return !collect_gl_scene2d_coverage_gaps(None, state, usage, true, None);
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
