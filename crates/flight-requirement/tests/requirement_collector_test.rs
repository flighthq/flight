use flight_requirement::*;

mod collect_scene2d_requirements {
    use super::*;

    fn report_scene_facts(sink: &mut Vec<Requirement>) {
        report_requirement(Some(&mut *sink), RequirementFacet::SceneNodeKind, "Shape");
        report_requirement(
            Some(&mut *sink),
            RequirementFacet::SceneBlendMode,
            "Multiply",
        );
        report_requirement(Some(&mut *sink), RequirementFacet::SceneNodeKind, "Shape");
    }

    #[test]
    fn returns_distinct_sorted_facts_and_the_exact_inspected_facets() {
        let result = collect_scene2d_requirements(&report_scene_facts);
        assert_eq!(
            result.covers,
            vec![
                RequirementFacet::SceneBlendMode,
                RequirementFacet::SceneMaterialKind,
                RequirementFacet::SceneNodeKind,
                RequirementFacet::SceneShapeCommand,
            ]
        );
        assert_eq!(
            result.requirements,
            vec![
                Requirement {
                    facet: RequirementFacet::SceneBlendMode,
                    key: "Multiply".to_string(),
                },
                Requirement {
                    facet: RequirementFacet::SceneNodeKind,
                    key: "Shape".to_string(),
                },
            ]
        );
    }
}

mod report_requirement {
    use super::*;

    #[test]
    fn records_only_when_a_collector_is_engaged() {
        let mut sink: Vec<Requirement> = Vec::new();
        report_requirement(None, RequirementFacet::SceneNodeKind, "Ignored");
        report_requirement(Some(&mut sink), RequirementFacet::SceneNodeKind, "Shape");
        assert_eq!(
            sink,
            vec![Requirement {
                facet: RequirementFacet::SceneNodeKind,
                key: "Shape".to_string(),
            }]
        );
    }
}
