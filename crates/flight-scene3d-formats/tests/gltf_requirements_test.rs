use crate::gltf_test_helper::{build_json_glb, full_gltf_document, minimal_gltf_document};
use flight_materials::{
    SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND, UNLIT_MATERIAL_KIND,
};
use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::contract::*;

mod parse_glb_requirements {
    use super::*;

    #[test]
    fn emits_no_requirements_for_an_unreadable_buffer() {
        assert!(parse_glb_requirements(&[0; 4]).requirements.is_empty());
    }

    #[test]
    fn extracts_features_from_a_valid_glb_and_emits_namespaced_requirements() {
        let set = parse_glb_requirements(&build_json_glb(
            r#"{"asset":{"version":"2.0"},"meshes":[{}]}"#,
        ));
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: "gltf.Mesh".to_string()
        }));
    }

    #[test]
    fn matches_the_equivalent_json_document_requirements_and_facets() {
        let document = full_gltf_document();
        {
            let mut source = document.write().unwrap();
            source.cameras = None;
            source.skins = None;
        }
        let from_glb = parse_glb_requirements(&build_json_glb(
            r#"{"asset":{"version":"2.0"},"meshes":[{}],"animations":[{}],"extensionsUsed":["KHR_materials_unlit"]}"#,
        ));
        let from_json = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
            source: &document,
        }));
        assert_eq!(from_glb.requirements, from_json.requirements);
        assert_eq!(from_glb.covers, from_json.covers);
    }
}

mod parse_gltf_requirements {
    use super::*;

    #[test]
    fn emits_namespaced_mesh_requirements_and_claims_standard_pbr() {
        let document = full_gltf_document();
        {
            let mut doc = document.write().unwrap();
            doc.animations = None;
            doc.cameras = None;
            doc.skins = None;
            doc.extensions_used = None;
        }
        let set = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
            source: &document,
        }));
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: "gltf.Mesh".to_string()
        }));
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::SceneMaterialKind,
            key: STANDARD_PBR_MATERIAL_KIND.to_string()
        }));
    }

    #[test]
    fn claims_no_material_kind_without_meshes_or_material_extensions() {
        let document = full_gltf_document();
        {
            let mut doc = document.write().unwrap();
            doc.animations = None;
            doc.meshes = None;
            doc.skins = None;
            doc.extensions_used = None;
        }
        let set = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
            source: &document,
        }));
        assert!(
            !set.requirements
                .iter()
                .any(|row| row.facet == RequirementFacet::SceneMaterialKind)
        );
    }

    #[test]
    fn claims_unlit_and_specular_glossiness_pbr_for_their_declared_extensions() {
        for (extension, material) in [
            ("KHR_materials_unlit", UNLIT_MATERIAL_KIND),
            (
                "KHR_materials_pbrSpecularGlossiness",
                SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND,
            ),
        ] {
            let document = minimal_gltf_document();
            document.write().unwrap().extensions_used = Some(vec![extension.to_string()]);
            let set = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
                source: &document,
            }));
            assert!(set.requirements.contains(&Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: material.to_string()
            }));
        }
    }

    #[test]
    fn emits_extension_names_as_document_format_requirements() {
        let document = minimal_gltf_document();
        document.write().unwrap().extensions_used =
            Some(vec!["KHR_draco_mesh_compression".to_string()]);
        let set = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
            source: &document,
        }));
        assert!(set.requirements.contains(&Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: "gltf.KHR_draco_mesh_compression".to_string()
        }));
    }

    #[test]
    fn emits_no_requirements_for_unparseable_input_and_always_declares_both_facets() {
        let set = parse_gltf_requirements(GltfSource::Json(GltfJsonSource {
            source: "not json {",
        }));
        assert!(set.requirements.is_empty());
        let set = parse_gltf_requirements(GltfSource::Json(GltfJsonSource { source: "invalid" }));
        assert_eq!(
            set.covers,
            [
                RequirementFacet::DocumentFormat,
                RequirementFacet::SceneMaterialKind
            ]
        );
    }

    #[test]
    fn emits_all_full_model_format_requirements_in_sorted_order_deterministically() {
        let document = full_gltf_document();
        let first = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
            source: &document,
        }));
        let second = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
            source: &document,
        }));
        assert_eq!(first.requirements, second.requirements);
        let keys: Vec<&str> = first
            .requirements
            .iter()
            .filter(|row| row.facet == RequirementFacet::DocumentFormat)
            .map(|row| row.key.as_str())
            .collect();
        assert_eq!(
            keys,
            [
                "gltf.Animation",
                "gltf.Camera",
                "gltf.KHR_materials_unlit",
                "gltf.Mesh",
                "gltf.Skin"
            ]
        );
    }

    #[test]
    fn accepts_json_string_and_matches_the_parsed_object_requirements() {
        let document = full_gltf_document();
        {
            let mut doc = document.write().unwrap();
            doc.animations = None;
            doc.cameras = None;
            doc.skins = None;
        }
        let from_object = parse_gltf_requirements(GltfSource::Document(GltfDocumentSource {
            source: &document,
        }));
        let from_string = parse_gltf_requirements(GltfSource::Json(GltfJsonSource {
            source: r#"{"asset":{"version":"2.0"},"meshes":[{}],"extensionsUsed":["KHR_materials_unlit"]}"#,
        }));
        assert_eq!(from_string.requirements, from_object.requirements);
    }
}
