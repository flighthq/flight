use flight_materials::{BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND};
use flight_requirement::RequirementFacet;
use flight_scene3d_formats::*;

mod parse_obj_requirements {
    use super::*;

    #[test]
    fn emits_sorted_topology_features_without_claiming_materials_and_always_declares_both_inspected_facets()
     {
        let face = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3";
        let set = parse_obj_requirements(face, None);
        assert_eq!(set.requirements.len(), 1);
        assert_eq!(set.requirements[0].facet, RequirementFacet::DocumentFormat);
        assert_eq!(set.requirements[0].key, "obj.Face");
        for source in ["", "# comment\n# another"] {
            let set = parse_obj_requirements(source, None);
            assert!(set.requirements.is_empty());
            assert_eq!(
                set.covers,
                [
                    RequirementFacet::DocumentFormat,
                    RequirementFacet::SceneMaterialKind
                ]
            );
        }
        let a = parse_obj_requirements("f 1 2 3\nl 1 2\np 1", None);
        let b = parse_obj_requirements("p 1\nl 1 2\nf 1 2 3", None);
        assert_eq!(a.requirements, b.requirements);
        assert_eq!(
            a.requirements
                .iter()
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            ["obj.Face", "obj.Line", "obj.Point"]
        );
    }

    #[test]
    fn replaces_coarse_material_with_models_from_supplied_libraries_or_the_safe_superset_when_unknown()
     {
        for source in ["usemtl M\nf 1 1 1", "mtllib a.mtl\nf 1 1 1"] {
            for (libraries, expected) in [
                (
                    None,
                    vec![BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND],
                ),
                (
                    Some(vec!["# comment".to_string()]),
                    vec![BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND],
                ),
                (
                    Some(vec!["newmtl M\nKd 1 0 0\n".to_string()]),
                    vec![BLINN_PHONG_MATERIAL_KIND],
                ),
                (
                    Some(vec!["newmtl M\nPr 0\n".to_string()]),
                    vec![STANDARD_PBR_MATERIAL_KIND],
                ),
                (
                    Some(vec!["newmtl A\nKd 1 0 0\nnewmtl B\nPr 0.3\n".to_string()]),
                    vec![BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND],
                ),
                (
                    Some(vec![
                        "newmtl A\nKd 1 0 0\n".to_string(),
                        "newmtl B\nPr 0.3\n".to_string(),
                    ]),
                    vec![BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND],
                ),
            ] {
                let result = parse_obj_requirements(source, libraries.as_deref());
                let kinds = result
                    .requirements
                    .iter()
                    .filter(|r| r.facet == RequirementFacet::SceneMaterialKind)
                    .map(|r| r.key.as_str())
                    .collect::<Vec<_>>();
                assert_eq!(kinds, expected);
                assert!(!result.requirements.iter().any(|r| r.key == "obj.Material"));
                assert_eq!(
                    result
                        .requirements
                        .iter()
                        .any(|r| r.key == "obj.MaterialBlinnPhong"),
                    expected.contains(&BLINN_PHONG_MATERIAL_KIND)
                );
                assert_eq!(
                    result
                        .requirements
                        .iter()
                        .any(|r| r.key == "obj.MaterialStandardPbr"),
                    expected.contains(&STANDARD_PBR_MATERIAL_KIND)
                );
                assert_eq!(
                    result.covers,
                    [
                        RequirementFacet::DocumentFormat,
                        RequirementFacet::SceneMaterialKind
                    ]
                );
            }
        }
        let libraries = ["newmtl M\nPr 0\n".to_string()];
        let result = parse_obj_requirements("f 1 1 1", Some(&libraries));
        assert_eq!(result.requirements.len(), 1);
        assert_eq!(result.requirements[0].key, "obj.Face");
    }
}
