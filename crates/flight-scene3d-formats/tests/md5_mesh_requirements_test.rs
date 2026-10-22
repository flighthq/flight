use flight_materials::BLINN_PHONG_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::contract::*;

mod feature_requirements {
    use super::*;
    #[test]
    fn maps_only_material_to_the_canonical_blinn_phong_requirement() {
        assert_eq!(MD5_MESH_FEATURE_SCENE_REQUIREMENTS.len(), 1);
        assert_eq!(MD5_MESH_FEATURE_SCENE_REQUIREMENTS[0].feature, "Material");
        assert_eq!(
            MD5_MESH_FEATURE_SCENE_REQUIREMENTS[0].requirements,
            vec![Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: BLINN_PHONG_MATERIAL_KIND.to_string()
            }]
        );
    }
}
mod parse_md5_mesh_requirements {
    use super::*;
    #[test]
    fn emits_exact_mesh_skeleton_and_authored_material_requirements() {
        let set = parse_md5_mesh_requirements(
            "joints {\n\"root\" -1 ( 0 0 0 ) ( 0 0 0 )\n}\nmesh {\nshader \"body\"\n}\n",
        );
        assert_eq!(
            set.requirements
                .iter()
                .filter(|r| r.facet == RequirementFacet::DocumentFormat)
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            vec!["md5.Material", "md5.Mesh", "md5.Skeleton"]
        );
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::SceneMaterialKind,
            key: BLINN_PHONG_MATERIAL_KIND.to_string()
        }));
        let set = parse_md5_mesh_requirements("joints {\n}\nmesh {\nshader \"\"\n}\n");
        assert_eq!(
            set.requirements
                .iter()
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            vec!["md5.Mesh", "md5.Skeleton"]
        );
    }
    #[test]
    fn keeps_both_covered_facets_with_no_requirements_and_is_section_order_independent() {
        for source in ["", "// just a comment\n// another one"] {
            let set = parse_md5_mesh_requirements(source);
            assert!(set.requirements.is_empty());
            assert_eq!(
                set.covers,
                vec![
                    RequirementFacet::DocumentFormat,
                    RequirementFacet::SceneMaterialKind
                ]
            );
        }
        assert_eq!(
            parse_md5_mesh_requirements("mesh {\nshader \"x\"\n}\njoints {\n}\n").requirements,
            parse_md5_mesh_requirements("joints {\n}\nmesh {\nshader \"x\"\n}\n").requirements
        );
    }
}
