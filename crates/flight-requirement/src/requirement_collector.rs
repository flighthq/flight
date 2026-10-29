//! flight-compiler: export-name collect_scene2d_requirements collectScene2DRequirements
use crate::requirement_set::{RequirementSet, create_requirement_set};
use crate::types::{Requirement, RequirementFacet};

/// Engages requirement recording for one Scene2D import. This is only a borrowed callback and
/// optional array-sink seam; it has no dependency on a Scene2D engine.
pub fn collect_scene2d_requirements(run: &dyn Fn(&mut Vec<Requirement>)) -> RequirementSet {
    let mut requirements: Vec<Requirement> = Vec::new();
    run(&mut requirements);
    return create_requirement_set(
        &[
            RequirementFacet::SceneBlendMode,
            RequirementFacet::SceneMaterialKind,
            RequirementFacet::SceneNodeKind,
            RequirementFacet::SceneShapeCommand,
        ],
        &requirements,
    );
}

/// Records one content fact when a collector is engaged; the default `None` path is a no-op.
pub fn report_requirement(sink: Option<&mut Vec<Requirement>>, facet: RequirementFacet, key: &str) {
    let Some(sink) = sink else {
        return;
    };
    sink.push(Requirement {
        facet,
        key: key.to_string(),
    });
}
