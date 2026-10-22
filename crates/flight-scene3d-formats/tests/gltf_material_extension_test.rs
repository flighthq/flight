use flight_entity::Ref;
use flight_materials::contract::{
    create_clearcoat_pbr_extension, create_sheen_pbr_extension, create_standard_pbr_material,
};
use flight_materials::{
    CLEARCOAT_PBR_EXTENSION_KIND, EXTENDED_PBR_MATERIAL_KIND, ExtendedPbrMaterial, Material,
    Material3D, MaterialAlphaMode, PbrExtension, SHEEN_PBR_EXTENSION_KIND,
    STANDARD_PBR_MATERIAL_KIND, StandardPbrMaterial,
};
use flight_scene3d::{
    Scene3DDocument, Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity,
    Scene3DDocumentMaterialFields, Scene3DDocumentScene,
};
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod attach_gltf_pbr_extension {
    use super::*;

    #[test]
    fn promotes_a_standard_material_and_carries_its_resolved_fields_into_the_standard_block() {
        let mut standard = create_standard_pbr_material();
        standard.base_color = 0x112233ff;
        standard.metallic = 0.25;
        standard.roughness = 0.75;
        standard.material3d_fields_mut().alpha_mode = MaterialAlphaMode::Mask;
        standard.material3d_fields_mut().alpha_cutoff = 0.25;
        standard.material3d_fields_mut().double_sided = true;
        standard.material_fields_mut().name = Some("Coated".to_string());
        let mut document = make_document(Scene3DDocumentMaterial::Entity(
            Scene3DDocumentMaterialEntity {
                material: Arc::new(RwLock::new(standard)),
            },
        ));
        let extension = clearcoat_extension(1.0);
        assert!(attach_gltf_pbr_extension(
            &mut document,
            0,
            extension.clone()
        ));
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected material entity");
        };
        let material = material.material.read().unwrap();
        let extended = material
            .as_any()
            .downcast_ref::<ExtendedPbrMaterial>()
            .unwrap();
        assert_eq!(extended.material_fields().kind, EXTENDED_PBR_MATERIAL_KIND);
        assert_eq!(extended.standard.base_color, 0x112233ff);
        // D1 f32 bound (TS: 0.0000005)
        assert!((extended.standard.metallic - 0.25).abs() < 0.0000005);
        // D1 f32 bound (TS: 0.0000005)
        assert!((extended.standard.roughness - 0.75).abs() < 0.0000005);
        assert_eq!(
            extended.material3d_fields().alpha_mode,
            MaterialAlphaMode::Mask
        );
        // D1 f32 bound (TS: 0.0000005)
        assert!((extended.material3d_fields().alpha_cutoff - 0.25).abs() < 0.0000005);
        assert!(extended.material3d_fields().double_sided);
        assert_eq!(extended.material_fields().name.as_deref(), Some("Coated"));
        assert!(Arc::ptr_eq(&extended.extensions[0], &extension));
    }

    #[test]
    fn composes_two_independently_imported_extensions_onto_one_material() {
        let mut document = standard_document();
        let clearcoat = clearcoat_extension(1.0);
        assert!(attach_gltf_pbr_extension(
            &mut document,
            0,
            clearcoat.clone()
        ));
        let original_material = match &document.materials[0] {
            Scene3DDocumentMaterial::Entity(material) => material.material.clone(),
            _ => panic!("expected entity"),
        };
        let mut sheen = create_sheen_pbr_extension();
        sheen.sheen_roughness = 0.5;
        let sheen = Arc::new(RwLock::new(PbrExtension::Sheen(sheen)));
        assert!(attach_gltf_pbr_extension(&mut document, 0, sheen.clone()));
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        assert!(Arc::ptr_eq(&material.material, &original_material));
        let material = material.material.read().unwrap();
        let extended = material
            .as_any()
            .downcast_ref::<ExtendedPbrMaterial>()
            .unwrap();
        assert_eq!(extended.extensions.len(), 2);
        assert!(Arc::ptr_eq(&extended.extensions[0], &clearcoat));
        assert!(Arc::ptr_eq(&extended.extensions[1], &sheen));
        assert_eq!(
            extension_kind(&extended.extensions[0]),
            CLEARCOAT_PBR_EXTENSION_KIND
        );
        assert_eq!(
            extension_kind(&extended.extensions[1]),
            SHEEN_PBR_EXTENSION_KIND
        );
    }

    #[test]
    fn drops_duplicate_kinds_and_keeps_the_original_descriptor() {
        let mut document = standard_document();
        let original = clearcoat_extension(1.0);
        assert!(attach_gltf_pbr_extension(
            &mut document,
            0,
            original.clone()
        ));
        assert!(!attach_gltf_pbr_extension(
            &mut document,
            0,
            clearcoat_extension(0.5)
        ));
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        let material = material.material.read().unwrap();
        let extended = material
            .as_any()
            .downcast_ref::<ExtendedPbrMaterial>()
            .unwrap();
        assert_eq!(extended.extensions.len(), 1);
        assert!(Arc::ptr_eq(&extended.extensions[0], &original));
        let extension = extended.extensions[0].read().unwrap();
        let PbrExtension::Clearcoat(extension) = &*extension else {
            panic!("expected clearcoat");
        };
        assert_eq!(extension.clearcoat, 1.0);
    }

    #[test]
    fn refuses_a_material_index_that_does_not_exist() {
        let mut document = standard_document();
        assert!(!attach_gltf_pbr_extension(
            &mut document,
            7,
            clearcoat_extension(0.0)
        ));
    }

    #[test]
    fn leaves_a_non_metallic_roughness_material_alone() {
        let mut document = make_document(Scene3DDocumentMaterial::Fields(
            Scene3DDocumentMaterialFields {
                kind: "UnlitMaterial".to_string(),
                name: None,
            },
        ));
        assert!(!attach_gltf_pbr_extension(
            &mut document,
            0,
            clearcoat_extension(0.0)
        ));
        let Scene3DDocumentMaterial::Fields(material) = &document.materials[0] else {
            panic!("expected original foreign fields");
        };
        assert_eq!(material.kind, "UnlitMaterial");
    }

    #[test]
    fn leaves_the_standard_material_in_place_until_an_extension_lands() {
        let document = standard_document();
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        let material = material.material.read().unwrap();
        assert_eq!(material.material_fields().kind, STANDARD_PBR_MATERIAL_KIND);
        let standard = material
            .as_any()
            .downcast_ref::<StandardPbrMaterial>()
            .unwrap();
        assert!(standard.roughness.is_finite());
    }

    #[test]
    fn promotion_copies_every_standard_property_and_retains_resolved_texture_handles() {
        let texture = create_external_texture_ref("resolved.png", None, None);
        let mut standard = create_standard_pbr_material();
        standard.alpha_map = Some(texture.clone());
        standard.base_color = 0x12345678;
        standard.base_color_map = Some(texture.clone());
        standard.emissive = 0x87654321;
        standard.emissive_map = Some(texture.clone());
        standard.emissive_strength = 3.0;
        standard.metallic = 0.75;
        standard.metallic_roughness_map = Some(texture.clone());
        standard.normal_map = Some(texture.clone());
        standard.normal_scale = 0.25;
        standard.occlusion_map = Some(texture.clone());
        standard.occlusion_strength = 0.5;
        standard.roughness = 0.125;
        let mut document = make_document(Scene3DDocumentMaterial::Entity(
            Scene3DDocumentMaterialEntity {
                material: Arc::new(RwLock::new(standard)),
            },
        ));
        assert!(attach_gltf_pbr_extension(
            &mut document,
            0,
            clearcoat_extension(1.0)
        ));
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        let material = material.material.read().unwrap();
        let properties = &material
            .as_any()
            .downcast_ref::<ExtendedPbrMaterial>()
            .unwrap()
            .standard;
        assert_eq!(properties.base_color, 0x12345678);
        assert_eq!(properties.emissive, 0x87654321);
        assert_eq!(properties.emissive_strength, 3.0);
        assert_eq!(properties.metallic, 0.75);
        assert_eq!(properties.normal_scale, 0.25);
        assert_eq!(properties.occlusion_strength, 0.5);
        assert_eq!(properties.roughness, 0.125);
        for map in [
            &properties.alpha_map,
            &properties.base_color_map,
            &properties.emissive_map,
            &properties.metallic_roughness_map,
            &properties.normal_map,
            &properties.occlusion_map,
        ] {
            assert!(Arc::ptr_eq(map.as_ref().unwrap(), &texture));
        }
    }
}

mod find_gltf_pbr_extension {
    use super::*;

    #[test]
    fn returns_the_extension_a_sibling_already_attached_and_preserves_alias_mutation() {
        let mut document = standard_document();
        let original = clearcoat_extension(0.6);
        assert!(attach_gltf_pbr_extension(
            &mut document,
            0,
            original.clone()
        ));
        let found = find_gltf_pbr_extension(&document, 0, CLEARCOAT_PBR_EXTENSION_KIND).unwrap();
        assert!(Arc::ptr_eq(&found, &original));
        {
            let extension = found.read().unwrap();
            let PbrExtension::Clearcoat(extension) = &*extension else {
                panic!("expected clearcoat");
            };
            // D1 f32 bound (TS: 0.0000005)
            assert!((extension.clearcoat - 0.6).abs() < 0.0000005);
        }
        {
            let mut alias = found.write().unwrap();
            let PbrExtension::Clearcoat(extension) = &mut *alias else {
                panic!("expected clearcoat");
            };
            extension.clearcoat = 0.25;
        }
        let second = find_gltf_pbr_extension(&document, 0, CLEARCOAT_PBR_EXTENSION_KIND).unwrap();
        assert!(Arc::ptr_eq(&found, &second));
        let second = second.read().unwrap();
        let PbrExtension::Clearcoat(extension) = &*second else {
            panic!("expected clearcoat");
        };
        assert_eq!(extension.clearcoat, 0.25);
    }

    #[test]
    fn returns_null_for_a_kind_not_attached_to_the_material() {
        let mut document = standard_document();
        assert!(attach_gltf_pbr_extension(
            &mut document,
            0,
            clearcoat_extension(0.0)
        ));
        assert!(find_gltf_pbr_extension(&document, 0, SHEEN_PBR_EXTENSION_KIND).is_none());
    }

    #[test]
    fn returns_null_for_a_material_still_on_the_standard_lane() {
        assert!(
            find_gltf_pbr_extension(&standard_document(), 0, CLEARCOAT_PBR_EXTENSION_KIND)
                .is_none()
        );
    }

    #[test]
    fn returns_null_for_a_material_index_that_does_not_exist() {
        assert!(
            find_gltf_pbr_extension(&standard_document(), 9, CLEARCOAT_PBR_EXTENSION_KIND)
                .is_none()
        );
    }
}

fn clearcoat_extension(clearcoat: f32) -> Ref<PbrExtension> {
    let mut extension = create_clearcoat_pbr_extension();
    extension.clearcoat = clearcoat;
    return Arc::new(RwLock::new(PbrExtension::Clearcoat(extension)));
}

fn extension_kind(extension: &Ref<PbrExtension>) -> String {
    let extension = extension.read().unwrap();
    return match &*extension {
        PbrExtension::Clearcoat(extension) => extension.kind.clone(),
        PbrExtension::Sheen(extension) => extension.kind.clone(),
        _ => panic!("expected source fixture extension"),
    };
}

fn make_document(material: Scene3DDocumentMaterial) -> Scene3DDocument {
    return Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: vec![material],
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: vec![Scene3DDocumentScene {
            name: None,
            root_nodes: Vec::new(),
        }],
        skins: Vec::new(),
    };
}

fn standard_document() -> Scene3DDocument {
    return make_document(Scene3DDocumentMaterial::Entity(
        Scene3DDocumentMaterialEntity {
            material: Arc::new(RwLock::new(create_standard_pbr_material())),
        },
    ));
}
