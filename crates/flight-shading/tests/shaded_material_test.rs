use std::sync::{Arc, PoisonError};

use flight_entity::{Entity, get_entity_uid, set_entity_uid};
use flight_materials::classic_materials::create_blinn_phong_material;
use flight_materials::material3d::is_material3d_masked;
use flight_materials::{BLEND_MODE_ADD, BLEND_MODE_NORMAL, Material3DRef, MaterialAlphaMode};
use flight_shading::*;

use crate::{modifier_ref, texture_ref};

mod create_shaded_material {
    use super::*;

    #[test]
    fn applies_provided_base_values_maps_and_modifier_stack() {
        let diffuse_map = texture_ref();
        let normal_map = texture_ref();
        let specular_map = texture_ref();
        let mut emissive = create_emissive_modifier();
        emissive.color = 0xffaa_00ff;
        let emissive = modifier_ref(emissive);
        let mut rim = create_rim_modifier();
        rim.color = 0x88bb_ffff;
        let rim = modifier_ref(rim);
        let modifiers = vec![emissive.clone(), rim.clone()];
        let mut material = create_shaded_material();
        material.diffuse = 0x1020_30ff;
        material.diffuse_map = Some(diffuse_map.clone());
        material.modifiers = modifiers;
        material.normal_map = Some(normal_map.clone());
        material.normal_scale = 0.75;
        material.shininess = 8.0;
        material.specular = 0xaabb_ccff;
        material.specular_map = Some(specular_map.clone());

        assert_eq!(material.diffuse, 0x1020_30ff);
        assert_eq!(material.normal_scale, 0.75);
        assert_eq!(material.shininess, 8.0);
        assert_eq!(material.specular, 0xaabb_ccff);
        assert!(Arc::ptr_eq(
            material.diffuse_map.as_ref().unwrap(),
            &diffuse_map
        ));
        assert!(Arc::ptr_eq(
            material.normal_map.as_ref().unwrap(),
            &normal_map
        ));
        assert!(Arc::ptr_eq(
            material.specular_map.as_ref().unwrap(),
            &specular_map
        ));
        assert_eq!(material.modifiers.len(), 2);
        assert!(Arc::ptr_eq(&material.modifiers[0], &emissive));
        assert!(Arc::ptr_eq(&material.modifiers[1], &rim));
        let first = material.modifiers[0]
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        let second = material.modifiers[1]
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        assert_eq!(first.modifier_fields().slot, MODIFIER_SLOT_EMISSIVE);
        assert_eq!(second.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn builds_an_entity_with_the_canonical_kind() {
        fn assert_entity<T: Entity>(_value: &T) {}

        let material = create_shaded_material();
        assert_eq!(material.kind, SHADED_MATERIAL_KIND);
        assert_entity(&material);
    }

    #[test]
    fn defaults_the_lit_base_and_modifier_stack() {
        let material = create_shaded_material();
        assert_eq!(material.diffuse, 0xffff_ffff);
        assert_eq!(material.specular, 0xffff_ffff);
        assert_eq!(material.shininess, 32.0);
        assert_eq!(material.normal_scale, 1.0);
        assert!(material.diffuse_map.is_none());
        assert!(material.normal_map.is_none());
        assert!(material.specular_map.is_none());
        assert!(material.modifiers.is_empty());
    }

    #[test]
    fn defaults_the_material3d_trailer() {
        let material = create_shaded_material();
        assert_eq!(material.name, None);
        assert_eq!(material.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(material.alpha_cutoff, 0.5);
        assert_eq!(material.blend_mode, BLEND_MODE_NORMAL);
        assert!(!material.double_sided);
    }

    #[test]
    fn forwards_the_material3d_trailer() {
        let mut material = create_shaded_material();
        material.alpha_cutoff = 0.25;
        material.alpha_mode = MaterialAlphaMode::Mask;
        material.blend_mode = BLEND_MODE_ADD.to_string();
        material.double_sided = true;

        assert_eq!(material.alpha_cutoff, 0.25);
        assert_eq!(material.alpha_mode, MaterialAlphaMode::Mask);
        assert_eq!(material.blend_mode, BLEND_MODE_ADD);
        assert!(material.double_sided);
    }
}

mod initialize_shaded_material {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut material = create_shaded_material();
        material.diffuse = 0;
        material.diffuse_map = Some(texture_ref());
        let mut toon = create_toon_modifier();
        toon.steps = 4.0;
        material.modifiers = vec![modifier_ref(toon)];
        material.normal_map = Some(texture_ref());
        material.normal_scale = 2.0;
        material.shininess = 2.0;
        material.specular = 0;
        material.specular_map = Some(texture_ref());
        material.alpha_cutoff = 0.25;
        material.alpha_mode = MaterialAlphaMode::Blend;
        material.blend_mode = BLEND_MODE_ADD.to_string();
        material.double_sided = true;
        material.name = Some("changed".to_string());
        set_entity_uid(&mut material, "shaded-material".to_string());

        initialize_shaded_material(&mut material);

        assert_eq!(material.kind, SHADED_MATERIAL_KIND);
        assert_eq!(material.diffuse, 0xffff_ffff);
        assert!(material.diffuse_map.is_none());
        assert!(material.modifiers.is_empty());
        assert!(material.normal_map.is_none());
        assert_eq!(material.normal_scale, 1.0);
        assert_eq!(material.shininess, 32.0);
        assert_eq!(material.specular, 0xffff_ffff);
        assert!(material.specular_map.is_none());
        assert_eq!(material.name, None);
        assert_eq!(material.alpha_cutoff, 0.5);
        assert_eq!(material.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(material.blend_mode, BLEND_MODE_NORMAL);
        assert!(!material.double_sided);
        assert_eq!(get_entity_uid(&mut material), "shaded-material");
    }
}

mod shaded_material_family {
    use super::*;

    #[test]
    fn joins_a_heterogeneous_material3d_list_as_its_original_allocation() {
        let mut rim = create_rim_modifier();
        rim.color = 0x88bb_ffff;
        let modifier = modifier_ref(rim);
        let mut material = create_shaded_material();
        material.alpha_mode = MaterialAlphaMode::Mask;
        material.modifiers = vec![modifier.clone()];
        let shaded: Arc<std::sync::RwLock<ShadedMaterial>> =
            Arc::new(std::sync::RwLock::new(material));
        let phong: Material3DRef = Arc::new(std::sync::RwLock::new(create_blinn_phong_material()));
        let as_family: Material3DRef = shaded.clone();
        let list = vec![phong.clone(), as_family.clone()];
        assert!(Arc::ptr_eq(&list[1], &as_family));
        let guard = list[1].read().unwrap();
        assert_eq!(guard.material3d_fields().kind, SHADED_MATERIAL_KIND);
        assert!(is_material3d_masked(&*guard));
        let concrete = guard.as_any().downcast_ref::<ShadedMaterial>().unwrap();
        assert!(Arc::ptr_eq(&concrete.modifiers[0], &modifier));
        assert!(
            list[0]
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<ShadedMaterial>()
                .is_none()
        );
    }

    #[test]
    fn keeps_one_entity_runtime_through_its_base_fields() {
        let material = create_shaded_material();
        let fields: &flight_materials::Material3DFields = &material;
        assert!(std::ptr::eq(
            material.entity_runtime(),
            fields.entity_runtime()
        ));
    }

    #[test]
    fn reads_its_modifier_stack_through_the_family_stream() {
        let mut rim = create_rim_modifier();
        rim.color = 0x88bb_ffff;
        let rim = modifier_ref(rim);
        let mut emissive = create_emissive_modifier();
        emissive.color = 0xffaa_00ff;
        let emissive = modifier_ref(emissive);
        let mut material = create_shaded_material();
        material.modifiers = vec![rim, emissive];
        let shaded: Material3DRef = Arc::new(std::sync::RwLock::new(material));
        let guard = shaded.read().unwrap();
        let stream = guard.modifier_stream().unwrap();
        assert_eq!(stream.len(), 2);
        assert!(!stream.is_empty());
        assert_eq!(stream.kind_at(0).as_deref(), Some(RIM_MODIFIER_KIND));
        assert_eq!(stream.kind_at(1).as_deref(), Some(EMISSIVE_MODIFIER_KIND));
        assert_eq!(stream.kind_at(2), None);

        let empty = create_shaded_material();
        let stream = flight_materials::Material::modifier_stream(&empty).unwrap();
        assert!(stream.is_empty());
        assert_eq!(stream.kind_at(0), None);
    }
}
