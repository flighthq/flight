use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use flight_scene3d_formats::*;

fn collada(body: &str) -> String {
    return format!(
        "<?xml version=\"1.0\"?><COLLADA xmlns=\"http://www.collada.org/2005/11/COLLADASchema\" version=\"1.4.1\">{body}</COLLADA>"
    );
}

fn features(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    collect_collada_features(&mut out, xml);
    return out;
}

fn full_document() -> String {
    return collada(concat!(
        "<library_geometries><geometry/></library_geometries>",
        "<library_materials><material/></library_materials>",
        "<library_effects><effect><profile_COMMON><technique><lambert/></technique></profile_COMMON></effect></library_effects>",
        "<library_cameras><camera><optics><technique_common><perspective/></technique_common></optics></camera></library_cameras>",
        "<library_lights><light><technique_common><point/></technique_common></light></library_lights>",
        "<library_images><image/></library_images>",
        "<library_controllers><controller><skin/></controller></library_controllers>",
        "<library_animations><animation/></library_animations>"
    ));
}

mod collada_feature_elements {
    use super::*;

    #[test]
    fn lists_all_coarse_and_subfeatures_on_content_elements_without_any_library_wrappers() {
        let mut coarse = COLLADA_FEATURE_ELEMENTS
            .iter()
            .filter(|entry| !entry.feature.contains('.'))
            .map(|entry| entry.feature.as_str())
            .collect::<Vec<_>>();
        coarse.sort();
        assert_eq!(
            coarse,
            [
                "Animation",
                "Camera",
                "Controller",
                "Geometry",
                "Image",
                "Light",
                "Material"
            ]
        );
        let mut sub = COLLADA_FEATURE_ELEMENTS
            .iter()
            .filter(|entry| entry.feature.contains('.'))
            .map(|entry| entry.feature.as_str())
            .collect::<Vec<_>>();
        sub.sort();
        assert_eq!(
            sub,
            [
                "Camera.Orthographic",
                "Camera.Perspective",
                "Controller.Morph",
                "Controller.Skin",
                "Effect.Blinn",
                "Effect.Lambert",
                "Effect.Phong",
                "Light.Ambient",
                "Light.Directional",
                "Light.Point",
                "Light.Spot"
            ]
        );
        for entry in COLLADA_FEATURE_ELEMENTS.iter() {
            assert!(!entry.elements.is_empty());
            for element in &entry.elements {
                assert!(!element.starts_with("library_"));
            }
        }
    }
}

mod collect_collada_element_counts {
    use super::*;

    #[test]
    fn distinguishes_unreadable_input_from_an_empty_readable_map_and_reuses_the_callers_storage() {
        let mut out = Vec::with_capacity(32);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        assert!(collect_collada_element_counts(&mut out, &full_document()));
        assert!(!out.is_empty());
        for xml in ["not xml", "<?xml version=\"1.0\"?><scene/>"] {
            assert!(!collect_collada_element_counts(&mut out, xml));
            assert!(out.is_empty());
        }
        assert!(collect_collada_element_counts(&mut out, &collada("")));
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }

    #[test]
    fn counts_every_source_coarse_and_scoped_subfeature_and_repeated_geometry_elements() {
        let mut out = Vec::new();
        assert!(collect_collada_element_counts(&mut out, &full_document()));
        for (feature, count) in [
            ("Geometry", 1),
            ("Camera", 1),
            ("Camera.Perspective", 1),
            ("Light", 1),
            ("Light.Point", 1),
            ("Material", 2),
            ("Effect.Lambert", 1),
            ("Image", 1),
            ("Controller", 1),
            ("Controller.Skin", 1),
            ("Animation", 1),
        ] {
            assert_eq!(
                out.iter()
                    .find(|entry| entry.feature == feature)
                    .unwrap()
                    .count,
                count
            );
        }
        assert!(collect_collada_element_counts(
            &mut out,
            &collada("<library_geometries><geometry/><geometry/><geometry/></library_geometries>")
        ));
        assert_eq!(out[0].feature, "Geometry");
        assert_eq!(out[0].count, 3);
    }
}

mod collect_collada_features {
    use super::*;

    #[test]
    fn reports_the_original_minimal_full_and_empty_library_cases_and_clears_then_reuses_feature_storage()
     {
        let mut out = Vec::with_capacity(32);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collect_collada_features(
            &mut out,
            &collada("<library_geometries><geometry/></library_geometries>"),
        );
        assert_eq!(out, ["Geometry"]);
        collect_collada_features(&mut out, &full_document());
        out.sort();
        assert_eq!(
            out,
            [
                "Animation",
                "Camera",
                "Camera.Perspective",
                "Controller",
                "Controller.Skin",
                "Effect.Lambert",
                "Geometry",
                "Image",
                "Light",
                "Light.Point",
                "Material"
            ]
        );
        collect_collada_features(
            &mut out,
            &collada(
                "<library_geometries/><library_materials/><library_effects/><library_cameras/><library_lights/><library_controllers/><library_animations/>",
            ),
        );
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }

    #[test]
    fn accepts_material_or_effect_content_and_reports_all_original_camera_light_effect_and_controller_subtypes()
     {
        for xml in [
            "<library_materials><material/></library_materials>",
            "<library_effects><effect/></library_effects>",
        ] {
            assert_eq!(features(&collada(xml)), ["Material"]);
        }
        for (element, feature) in [
            ("perspective", "Camera.Perspective"),
            ("orthographic", "Camera.Orthographic"),
        ] {
            let mut found = features(&collada(&format!(
                "<library_cameras><camera><optics><technique_common><{element}/></technique_common></optics></camera></library_cameras>"
            )));
            found.sort();
            assert_eq!(found, ["Camera", feature]);
        }
        for (element, feature) in [
            ("point", "Light.Point"),
            ("directional", "Light.Directional"),
            ("spot", "Light.Spot"),
            ("ambient", "Light.Ambient"),
        ] {
            let mut found = features(&collada(&format!(
                "<library_lights><light><technique_common><{element}/></technique_common></light></library_lights>"
            )));
            found.sort();
            assert_eq!(found, ["Light", feature]);
        }
        for (element, feature) in [
            ("phong", "Effect.Phong"),
            ("blinn", "Effect.Blinn"),
            ("lambert", "Effect.Lambert"),
        ] {
            let mut found = features(&collada(&format!(
                "<library_effects><effect><profile_COMMON><technique><{element}/></technique></profile_COMMON></effect></library_effects>"
            )));
            found.sort();
            assert_eq!(found, [feature, "Material"]);
        }
        let mut found = features(&collada(
            "<library_controllers><controller><skin source=\"#geo\"/></controller></library_controllers>",
        ));
        found.sort();
        assert_eq!(found, ["Controller", "Controller.Skin"]);
    }

    #[test]
    fn does_not_misclassify_a_material_ambient_term_as_an_ambient_light() {
        let found = features(&collada(
            "<library_effects><effect><profile_COMMON><technique><phong><ambient><color>0 0 0 1</color></ambient></phong></technique></profile_COMMON></effect></library_effects>",
        ));
        assert!(found.iter().any(|feature| feature == "Effect.Phong"));
        assert!(found.iter().any(|feature| feature == "Material"));
        assert!(!found.iter().any(|feature| feature == "Light.Ambient"));
    }

    #[test]
    fn reports_images_namespaced_elements_and_content_nested_beyond_library_children() {
        assert!(
            features(&collada(
                "<library_images><image><init_from>texture.png</init_from></image></library_images>"
            ))
            .iter()
            .any(|feature| feature == "Image")
        );
        let mut found = features(
            "<?xml version=\"1.0\"?><c:COLLADA xmlns:c=\"http://www.collada.org/2005/11/COLLADASchema\"><c:library_geometries><c:geometry/></c:library_geometries><c:library_cameras><c:camera/></c:library_cameras></c:COLLADA>",
        );
        found.sort();
        assert_eq!(found, ["Camera", "Geometry"]);
        assert_eq!(
            features(&collada(
                "<scene><node><instance><camera/></instance></node></scene>"
            )),
            ["Camera"]
        );
    }

    #[test]
    fn preserves_every_unreadable_table_row_and_the_xml_parsers_source_truncation_recovery() {
        for xml in [
            "",
            "this is not xml",
            "<?xml version=\"1.0\"?><scene><geometry/></scene>",
        ] {
            assert!(features(xml).is_empty());
        }
        assert_eq!(
            features("<COLLADA><library_geometries><geometry/>"),
            ["Geometry"]
        );
    }
}

mod is_readable_collada {
    use super::*;

    #[test]
    fn separates_unreadable_documents_from_documents_that_need_no_features() {
        assert!(is_readable_collada(&collada("")));
        assert!(!is_readable_collada("not xml"));
        assert!(!is_readable_collada("<?xml version=\"1.0\"?><scene/>"));
    }
}

mod parse_collada_requirements {
    use super::*;

    #[test]
    fn emits_only_namespaced_geometry_requirements_when_no_shading_is_present() {
        let set = parse_collada_requirements(&collada(
            "<library_geometries><geometry/></library_geometries>",
        ));
        assert_eq!(
            set.requirements,
            [Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: "dae.Geometry".to_string()
            }]
        );
        assert!(
            !set.requirements
                .iter()
                .any(|req| req.facet == RequirementFacet::SceneMaterialKind)
        );
    }

    #[test]
    fn claims_standard_pbr_for_either_material_or_effect_and_always_declares_both_covered_facets() {
        for content in [
            "<library_materials><material/></library_materials>",
            "<library_effects><effect/></library_effects>",
        ] {
            assert!(
                parse_collada_requirements(&collada(content))
                    .requirements
                    .contains(&Requirement {
                        facet: RequirementFacet::SceneMaterialKind,
                        key: STANDARD_PBR_MATERIAL_KIND.to_string()
                    })
            );
        }
        assert_eq!(
            parse_collada_requirements(&collada("")).covers,
            [
                RequirementFacet::DocumentFormat,
                RequirementFacet::SceneMaterialKind
            ]
        );
        let invalid = parse_collada_requirements("not xml");
        assert!(invalid.requirements.is_empty());
        assert!(!invalid.covers.is_empty());
    }

    #[test]
    fn emits_coarse_and_subfeature_keys_and_remains_deterministic_when_document_order_changes() {
        let set = parse_collada_requirements(&collada(
            "<library_cameras><camera><optics><technique_common><perspective/></technique_common></optics></camera></library_cameras>",
        ));
        for key in ["dae.Camera", "dae.Camera.Perspective"] {
            assert!(set.requirements.contains(&Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: key.to_string()
            }));
        }
        let forward = collada(
            "<library_cameras><camera/></library_cameras><library_geometries><geometry/></library_geometries>",
        );
        let reverse = collada(
            "<library_geometries><geometry/></library_geometries><library_cameras><camera/></library_cameras>",
        );
        assert_eq!(
            parse_collada_requirements(&forward).requirements,
            parse_collada_requirements(&reverse).requirements
        );
    }
}
