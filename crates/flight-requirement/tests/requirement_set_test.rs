use flight_requirement::contract::*;

fn requirement(facet: RequirementFacet, key: &str) -> Requirement {
    return Requirement {
        facet,
        key: key.to_string(),
    };
}

mod create_requirement_set {
    use super::*;

    #[test]
    fn copies_sorts_and_deduplicates_both_dimensions() {
        let covers = vec![
            RequirementFacet::SceneNodeKind,
            RequirementFacet::SceneBlendMode,
            RequirementFacet::SceneNodeKind,
        ];
        let mut requirements = vec![
            requirement(RequirementFacet::SceneNodeKind, "Shape"),
            requirement(RequirementFacet::SceneBlendMode, "Multiply"),
            requirement(RequirementFacet::SceneNodeKind, "Shape"),
        ];
        let result = create_requirement_set(&covers, &requirements);
        requirements.clear();
        assert_eq!(
            result.covers,
            vec![
                RequirementFacet::SceneBlendMode,
                RequirementFacet::SceneNodeKind,
            ]
        );
        assert_eq!(
            result.requirements,
            vec![
                requirement(RequirementFacet::SceneBlendMode, "Multiply"),
                requirement(RequirementFacet::SceneNodeKind, "Shape"),
            ]
        );
    }

    #[test]
    fn creates_an_entity_with_an_empty_runtime_slot() {
        let result = create_requirement_set(&[], &[]);
        assert!(!flight_entity::has_entity_runtime(&result));
    }
}

mod diff_requirement_sets {
    use super::*;

    #[test]
    fn subtracts_facts_only_for_facets_both_operands_cover() {
        let requirements = create_requirement_set(
            &[
                RequirementFacet::SceneBlendMode,
                RequirementFacet::SceneNodeKind,
            ],
            &[
                requirement(RequirementFacet::SceneBlendMode, "Multiply"),
                requirement(RequirementFacet::SceneNodeKind, "Shape"),
            ],
        );
        let baseline = create_requirement_set(
            &[RequirementFacet::SceneNodeKind],
            &[requirement(RequirementFacet::SceneNodeKind, "Sprite")],
        );
        let result = diff_requirement_sets(&requirements, &baseline);
        assert_eq!(result.covers, vec![RequirementFacet::SceneNodeKind]);
        assert_eq!(
            result.requirements,
            vec![requirement(RequirementFacet::SceneNodeKind, "Shape")]
        );
    }

    #[test]
    fn removes_an_identical_fact_within_shared_coverage() {
        let fact = requirement(RequirementFacet::DocumentFormat, "application/x-test");
        let requirements =
            create_requirement_set(&[RequirementFacet::DocumentFormat], &[fact.clone()]);
        let baseline = create_requirement_set(&[RequirementFacet::DocumentFormat], &[fact]);
        let result = diff_requirement_sets(&requirements, &baseline);
        assert!(result.requirements.is_empty());
    }
}

mod initialize_requirement_set {
    use super::*;

    #[test]
    fn replaces_canonical_data_without_replacing_the_entity_runtime() {
        let mut out = create_requirement_set(&[], &[]);
        flight_entity::set_entity_uid(&mut out, "requirement-set".to_string());
        initialize_requirement_set(
            &mut out,
            &[RequirementFacet::SceneNodeKind],
            &[requirement(RequirementFacet::SceneNodeKind, "Shape")],
        );
        assert_eq!(flight_entity::get_entity_uid(&mut out), "requirement-set");
        assert_eq!(out.covers, vec![RequirementFacet::SceneNodeKind]);
        assert_eq!(
            out.requirements,
            vec![requirement(RequirementFacet::SceneNodeKind, "Shape")]
        );
    }
}

mod merge_requirement_sets {
    use super::*;

    #[test]
    fn returns_an_empty_set_for_no_inputs() {
        let result = merge_requirement_sets(&[]);
        assert!(result.covers.is_empty());
        assert!(result.requirements.is_empty());
    }

    #[test]
    fn unions_facts_while_intersecting_completeness() {
        let first = create_requirement_set(
            &[
                RequirementFacet::SceneBlendMode,
                RequirementFacet::SceneNodeKind,
            ],
            &[requirement(RequirementFacet::SceneNodeKind, "Shape")],
        );
        let second = create_requirement_set(
            &[RequirementFacet::SceneNodeKind],
            &[
                requirement(RequirementFacet::SceneNodeKind, "Sprite"),
                requirement(RequirementFacet::SceneNodeKind, "Shape"),
            ],
        );
        let result = merge_requirement_sets(&[&first, &second]);
        assert_eq!(result.covers, vec![RequirementFacet::SceneNodeKind]);
        assert_eq!(
            result.requirements,
            vec![
                requirement(RequirementFacet::SceneNodeKind, "Shape"),
                requirement(RequirementFacet::SceneNodeKind, "Sprite"),
            ]
        );
    }
}
