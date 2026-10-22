use super::obj_test_helper::*;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_materials::{BLINN_PHONG_MATERIAL_KIND, Material, Material3D, MaterialAlphaMode};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};

mod obj_blinn_phong_material_handler {
    use super::*;
    #[test]
    fn claims_only_classic_materials_and_resolves_through_the_actual_public_converter() {
        let (feature, matches, resolve) = {
            let handler = OBJ_BLINN_PHONG_MATERIAL_HANDLER.read().unwrap();
            (
                handler.feature.clone(),
                handler.matches.clone(),
                handler.resolve.clone(),
            )
        };
        assert_eq!(feature, OBJ_MATERIAL_BLINN_PHONG_FEATURE);
        let mut input = material_fixture("classic");
        assert!(matches(&input));
        let mut document = empty_document();
        let Scene3DDocumentMaterial::Entity(result) = resolve(&input, &mut document, None) else {
            panic!("entity");
        };
        assert_eq!(
            result.material.read().unwrap().material_fields().kind,
            BLINN_PHONG_MATERIAL_KIND
        );
        input.roughness = Some(0.0);
        assert!(!matches(&input));
    }
}

mod obj_material_to_blinn_phong {
    use super::*;

    #[test]
    fn converts_the_original_classic_fixture_and_its_dissolve_variant() {
        let mut input = material_fixture("classic");
        let result = obj_material_to_blinn_phong(&mut empty_document(), &input, None);
        assert_eq!(result.material_fields().kind, BLINN_PHONG_MATERIAL_KIND);
        input.dissolve = 0.5;
        let result = obj_material_to_blinn_phong(&mut empty_document(), &input, None);
        assert_eq!(
            result.material3d_fields().alpha_mode,
            MaterialAlphaMode::Blend
        );
        input.dissolve = 1.0;
        let matches = OBJ_BLINN_PHONG_MATERIAL_HANDLER
            .read()
            .unwrap()
            .matches
            .clone();
        assert!(matches(&input));
        input.roughness = Some(0.5);
        assert!(!matches(&input));
    }

    #[test]
    fn converts_authored_channels_and_textures_without_treating_height_as_a_normal_map() {
        let mut input = material_fixture("classic");
        input.map_diffuse = Some("color.png".to_string());
        input.map_specular = Some("specular.png".to_string());
        input.map_normal = Some("normal.png".to_string());
        input.map_bump = Some("height.png".to_string());
        input.emissive = Some([1.0; 3]);
        input.map_dissolve = Some("alpha.png".to_string());
        input.dissolve = 0.5;
        let mut document = empty_document();
        let mut diagnostics = Vec::new();
        let result = obj_material_to_blinn_phong(&mut document, &input, Some(&mut diagnostics));
        assert_eq!(result.material_fields().kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(result.diffuse, 0xcc331a80);
        assert_eq!(result.specular, 0xffffffff);
        assert_eq!(result.shininess, 100.0);
        assert_eq!(
            result.material3d_fields().alpha_mode,
            MaterialAlphaMode::Blend
        );
        assert_eq!(document.resources.len(), 4);
        assert!(document.materials.is_empty());
        for (texture, expected) in [
            (
                result.alpha_map.as_ref().unwrap(),
                TextureColorSpace::Linear,
            ),
            (
                result.diffuse_map.as_ref().unwrap(),
                TextureColorSpace::Srgb,
            ),
            (
                result.normal_map.as_ref().unwrap(),
                TextureColorSpace::Linear,
            ),
            (
                result.specular_map.as_ref().unwrap(),
                TextureColorSpace::Srgb,
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
                ("mtl.emissive-dropped", "resolveObjMaterial"),
                ("mtl.bump-height-map-unbound", "objMaterialToBlinnPhong")
            ]
        );
        for crumb in diagnostics {
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(
                crumb.detail.unwrap().get("name"),
                Some(&ImportDiagnosticDetailValue::String("classic".to_string()))
            );
        }
        let mut input = material_fixture("height-only");
        input.map_bump = Some("height.png".to_string());
        let result = obj_material_to_blinn_phong(&mut empty_document(), &input, None);
        assert!(result.normal_map.is_none());
    }
    #[test]
    fn constructs_fresh_material_entities_and_texture_handles_while_reusing_only_the_original_resource()
     {
        let mut document = empty_document();
        let mut input = material_fixture("shared");
        input.map_diffuse = Some("shared.png".to_string());
        let mut first = obj_material_to_blinn_phong(&mut document, &input, None);
        let first_uid = flight_entity::get_entity_uid(&mut first);
        let first_texture = first.diffuse_map.clone().unwrap();
        first.name = Some("retained".to_string());
        first.diffuse = 0;
        let mut second = obj_material_to_blinn_phong(&mut document, &input, None);
        assert_ne!(flight_entity::get_entity_uid(&mut second), first_uid);
        assert_eq!(flight_entity::get_entity_uid(&mut first), first_uid);
        assert_eq!(first.name.as_deref(), Some("retained"));
        assert_eq!(first.diffuse, 0);
        assert!(second.name.is_none());
        assert_eq!(
            second.diffuse,
            pack_obj_color(&input.diffuse, input.dissolve)
        );
        assert!(!std::sync::Arc::ptr_eq(
            &first_texture,
            second.diffuse_map.as_ref().unwrap()
        ));
        assert_eq!(document.resources.len(), 1);
        assert_eq!(
            first_texture.read().unwrap().texture_fields().color_space,
            TextureColorSpace::Srgb
        );
    }
}
