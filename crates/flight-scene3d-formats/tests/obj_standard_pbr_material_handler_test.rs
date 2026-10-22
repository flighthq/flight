use super::obj_test_helper::*;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_materials::{Material, Material3D, MaterialAlphaMode, STANDARD_PBR_MATERIAL_KIND};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};

mod obj_material_to_standard_pbr {
    use super::*;

    #[test]
    fn converts_the_original_pbr_fixture_and_its_dissolve_variant() {
        let mut input = material_fixture("pbr");
        input.roughness = Some(0.5);
        let result = obj_material_to_standard_pbr(&mut empty_document(), &input, None);
        assert_eq!(result.material_fields().kind, STANDARD_PBR_MATERIAL_KIND);
        input.dissolve = 0.5;
        let result = obj_material_to_standard_pbr(&mut empty_document(), &input, None);
        assert_eq!(
            result.material3d_fields().alpha_mode,
            MaterialAlphaMode::Blend
        );
        input.dissolve = 1.0;
        let matches = OBJ_STANDARD_PBR_MATERIAL_HANDLER
            .read()
            .unwrap()
            .matches
            .clone();
        assert!(matches(&input));
        input.roughness = None;
        assert!(!matches(&input));
    }

    #[test]
    fn preserves_explicit_pbr_values_and_channel_spaces_without_packing_separate_roughness_or_metallic_images()
     {
        let mut input = material_fixture("pbr");
        input.roughness = Some(0.0);
        input.metallic = Some(0.0);
        input.emissive = Some([1.0, 0.5, 0.0]);
        input.map_diffuse = Some("color.png".to_string());
        input.map_dissolve = Some("alpha.png".to_string());
        input.map_emissive = Some("emissive.png".to_string());
        input.map_normal = Some("normal.png".to_string());
        input.map_roughness = Some("rough.png".to_string());
        input.map_metallic = Some("metal.png".to_string());
        input.map_bump = Some("height.png".to_string());
        input.clearcoat = Some(0.5);
        let mut document = empty_document();
        let mut diagnostics = Vec::new();
        let result = obj_material_to_standard_pbr(&mut document, &input, Some(&mut diagnostics));
        assert_eq!(result.material_fields().kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(result.base_color, 0xcc331aff);
        assert_eq!(result.roughness, 0.0);
        assert_eq!(result.metallic, 0.0);
        assert_eq!(result.emissive, 0xff8000ff);
        assert!(result.metallic_roughness_map.is_none());
        assert_eq!(
            result.material3d_fields().alpha_mode,
            MaterialAlphaMode::Blend
        );
        assert_eq!(document.resources.len(), 4);
        for (texture, expected) in [
            (
                result.alpha_map.as_ref().unwrap(),
                TextureColorSpace::Linear,
            ),
            (
                result.base_color_map.as_ref().unwrap(),
                TextureColorSpace::Srgb,
            ),
            (
                result.emissive_map.as_ref().unwrap(),
                TextureColorSpace::Srgb,
            ),
            (
                result.normal_map.as_ref().unwrap(),
                TextureColorSpace::Linear,
            ),
        ] {
            assert_eq!(
                texture.read().unwrap().texture_fields().color_space,
                expected
            );
        }
        assert_eq!(
            diagnostics
                .iter()
                .map(|crumb| (crumb.kind.as_str(), crumb.origin.as_str()))
                .collect::<Vec<_>>(),
            [
                ("mtl.metallic-roughness-map-unpacked", "resolveObjMaterial"),
                ("mtl.bump-height-map-unbound", "objMaterialToStandardPbr")
            ]
        );
        assert!(
            diagnostics
                .iter()
                .all(|crumb| crumb.severity == ImportDiagnosticSeverity::Skip)
        );
    }
    #[test]
    fn constructs_fresh_pbr_materials_without_mutating_previous_entities_or_reusing_their_texture_handles()
     {
        let mut document = empty_document();
        let mut input = material_fixture("shared");
        input.map_diffuse = Some("shared.png".to_string());
        input.metallic = Some(0.75);
        input.roughness = Some(0.25);
        let mut first = obj_material_to_standard_pbr(&mut document, &input, None);
        let first_uid = flight_entity::get_entity_uid(&mut first);
        let first_texture = first.base_color_map.clone().unwrap();
        first.name = Some("retained".to_string());
        first.metallic = 0.0;
        let mut second = obj_material_to_standard_pbr(&mut document, &input, None);
        assert_ne!(flight_entity::get_entity_uid(&mut second), first_uid);
        assert_eq!(flight_entity::get_entity_uid(&mut first), first_uid);
        assert_eq!(first.name.as_deref(), Some("retained"));
        assert_eq!(first.metallic, 0.0);
        assert!(second.name.is_none());
        assert_eq!(second.metallic, 0.75);
        assert_eq!(second.roughness, 0.25);
        assert!(!std::sync::Arc::ptr_eq(
            &first_texture,
            second.base_color_map.as_ref().unwrap()
        ));
        assert_eq!(document.resources.len(), 1);
    }
}

mod obj_standard_pbr_material_handler {
    use super::*;
    #[test]
    fn matches_only_declared_pbr_fields_and_uses_constructor_defaults_for_absent_factors() {
        let (feature, matches, resolve) = {
            let handler = OBJ_STANDARD_PBR_MATERIAL_HANDLER.read().unwrap();
            (
                handler.feature.clone(),
                handler.matches.clone(),
                handler.resolve.clone(),
            )
        };
        assert_eq!(feature, OBJ_MATERIAL_STANDARD_PBR_FEATURE);
        let mut input = material_fixture("classic");
        assert!(!matches(&input));
        input.roughness = Some(0.5);
        assert!(matches(&input));
        input.roughness = None;
        input.metallic = Some(0.0);
        assert!(matches(&input));
        let result = obj_material_to_standard_pbr(&mut empty_document(), &input, None);
        assert_eq!(result.metallic, 0.0);
        assert_eq!(result.roughness, 1.0);
        let Scene3DDocumentMaterial::Entity(result) = resolve(&input, &mut empty_document(), None)
        else {
            panic!("entity");
        };
        assert_eq!(
            result.material.read().unwrap().material_fields().kind,
            STANDARD_PBR_MATERIAL_KIND
        );
        input.dissolve = 0.5;
        assert_eq!(
            obj_material_to_standard_pbr(&mut empty_document(), &input, None)
                .material3d_fields()
                .alpha_mode,
            MaterialAlphaMode::Blend
        );
    }
}
