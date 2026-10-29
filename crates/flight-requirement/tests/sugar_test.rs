//! flight-compiler: rust-only

use flight_requirement::contract::*;

fn requirement(facet: RequirementFacet, key: &str) -> Requirement {
    return Requirement {
        facet,
        key: key.to_string(),
    };
}

#[test]
fn requirement_set_diff_matches_the_free_function() {
    let requirements = RequirementSet::new(
        &[RequirementFacet::SceneNodeKind],
        &[requirement(RequirementFacet::SceneNodeKind, "Shape")],
    );
    let baseline = RequirementSet::new(&[RequirementFacet::SceneNodeKind], &[]);
    assert_eq!(
        requirements.diff(&baseline),
        diff_requirement_sets(&requirements, &baseline)
    );
}

#[test]
fn requirement_set_new_matches_create_requirement_set() {
    let covers = [RequirementFacet::SceneNodeKind];
    let requirements = [requirement(RequirementFacet::SceneNodeKind, "Shape")];
    assert_eq!(
        RequirementSet::new(&covers, &requirements),
        create_requirement_set(&covers, &requirements)
    );
}
