//! flight-compiler: rust-only

use flight_requirement::contract::*;

#[test]
fn create_requirement_set_copies_caller_owned_records() {
    let covers = vec![RequirementFacet::SceneNodeKind];
    let mut facts = vec![Requirement {
        facet: RequirementFacet::SceneNodeKind,
        key: "Shape".to_string(),
    }];
    let result = create_requirement_set(&covers, &facts);
    facts[0].key = "Sprite".to_string();
    assert_eq!(result.requirements[0].key, "Shape");
}
