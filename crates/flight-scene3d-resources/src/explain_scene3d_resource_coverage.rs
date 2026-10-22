use flight_entity::{Kind, Ref};
use flight_render::{
    CatalogRegistration, RenderRegistryTable, SceneCoverage, SceneCoverageCatalog,
    SceneCoverageEntry,
};
use flight_requirement::RequirementFacet;
use flight_scene3d::Scene3DKindUsage;

use crate::scene_material_texture_registry::has_scene3d_material_texture_lister;
use crate::types::*;

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
            module: None,
            registrar: None,
            registry,
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
        module: Some(registration.module.clone()),
        registrar: Some(registration.registrar.clone()),
        registry,
    };
}

// The single implementation both tiers read, so the boolean never disagrees with the explanation.
// `found` counts only real shortfalls, so satisfied entries never flip the predicate.
fn collect_scene3d_resource_coverage_gaps(
    mut out: Option<&mut Vec<SceneCoverageEntry>>,
    resolver: &Ref<Scene3DResourceResolver>,
    usage: &Scene3DKindUsage,
    stop_at_first: bool,
    catalog: Option<&SceneCoverageCatalog>,
) -> bool {
    let registry = resolver.read().unwrap().registry.clone();
    let mut found = false;
    for kind in &usage.material_kinds {
        if has_scene3d_material_texture_lister(&registry, kind) {
            if let Some(out) = out.as_deref_mut() {
                out.push(SceneCoverageEntry {
                    coverage: SceneCoverage::Satisfied,
                    facet: RequirementFacet::SceneMaterialKind,
                    kind: kind.clone(),
                    module: None,
                    registrar: None,
                    registry: RenderRegistryTable::MaterialTextureLister,
                });
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
                RequirementFacet::SceneMaterialKind,
                kind,
                RenderRegistryTable::MaterialTextureLister,
            ));
        }
    }
    return found;
}

/// Clears `out`, then reports every material kind in `usage` with how well this resolver describes
/// it, satisfied kinds included, so one call is a complete manifest. The verdict reads the live
/// registry; `catalog` supplies the remedy only for a shortfall. A gap is always a total absence:
/// the registry has no default lister.
pub fn explain_scene3d_resource_coverage(
    out: &mut Vec<SceneCoverageEntry>,
    resolver: &Ref<Scene3DResourceResolver>,
    usage: &Scene3DKindUsage,
    catalog: &SceneCoverageCatalog,
) {
    out.clear();
    collect_scene3d_resource_coverage_gaps(Some(out), resolver, usage, false, Some(catalog));
}

fn find_catalog_registration<'a>(
    catalog: Option<&'a SceneCoverageCatalog>,
    kind: &Kind,
    registry: RenderRegistryTable,
) -> Option<&'a CatalogRegistration> {
    for entry in catalog? {
        if &entry.kind == kind && entry.registry == registry {
            return entry.registrations.first();
        }
    }
    return None;
}

/// Whether this resolver can describe every material kind `usage` names. Stops at the first gap and
/// never allocates.
pub fn has_scene3d_resource_coverage(
    resolver: &Ref<Scene3DResourceResolver>,
    usage: &Scene3DKindUsage,
) -> bool {
    return !collect_scene3d_resource_coverage_gaps(None, resolver, usage, true, None);
}
