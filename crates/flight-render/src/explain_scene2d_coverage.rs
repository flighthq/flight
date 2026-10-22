use flight_requirement::RequirementFacet;
use flight_scene2d::Scene2DKindUsage;

use crate::{
    CatalogRegistration, RenderRegistryTable, RenderState, SceneCoverage, SceneCoverageCatalog,
    SceneCoverageEntry,
};

fn collect_scene_2d_coverage_gaps<S: RenderState>(
    out: &mut Vec<SceneCoverageEntry>,
    state: &S,
    usage: &Scene2DKindUsage,
    stop_at_first: bool,
    catalog: Option<&SceneCoverageCatalog>,
) -> bool {
    let mut found = false;
    for kind in &usage.node_kinds {
        if state
            .render_registries()
            .node_renderers
            .entries
            .contains_key(kind)
        {
            out.push(satisfied_entry(
                RequirementFacet::SceneNodeKind,
                kind,
                RenderRegistryTable::NodeRenderer,
            ));
        } else {
            found = true;
            if stop_at_first {
                return true;
            }
            out.push(shortfall_entry(
                catalog,
                RequirementFacet::SceneNodeKind,
                kind,
                RenderRegistryTable::NodeRenderer,
            ));
        }
    }

    for kind in &usage.shape_command_keys {
        let registered = state
            .render_registries()
            .canvas_shape_commands
            .as_ref()
            .is_some_and(|commands| commands.entries.contains_key(kind));
        if registered {
            out.push(satisfied_entry(
                RequirementFacet::SceneShapeCommand,
                kind,
                RenderRegistryTable::ShapeCommandHandler,
            ));
        } else {
            found = true;
            if stop_at_first {
                return true;
            }
            out.push(shortfall_entry(
                catalog,
                RequirementFacet::SceneShapeCommand,
                kind,
                RenderRegistryTable::ShapeCommandHandler,
            ));
        }
    }
    return found;
}

pub fn explain_scene_2d_coverage<S: RenderState>(
    out: &mut Vec<SceneCoverageEntry>,
    state: &S,
    usage: &Scene2DKindUsage,
    catalog: &SceneCoverageCatalog,
) {
    out.clear();
    collect_scene_2d_coverage_gaps(out, state, usage, false, Some(catalog));
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

pub fn has_scene_2d_coverage<S: RenderState>(state: &S, usage: &Scene2DKindUsage) -> bool {
    let mut ignored = Vec::new();
    return !collect_scene_2d_coverage_gaps(&mut ignored, state, usage, true, None);
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

fn shortfall_entry(
    catalog: Option<&SceneCoverageCatalog>,
    facet: RequirementFacet,
    kind: &str,
    registry: RenderRegistryTable,
) -> SceneCoverageEntry {
    let registration = find_catalog_registration(catalog, kind, registry);
    return SceneCoverageEntry {
        coverage: if registration.is_some() {
            SceneCoverage::Unregistered
        } else {
            SceneCoverage::Unavailable
        },
        facet,
        kind: kind.to_string(),
        registry,
        module: registration.map(|value| value.module.clone()),
        registrar: registration.map(|value| value.registrar.clone()),
    };
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
