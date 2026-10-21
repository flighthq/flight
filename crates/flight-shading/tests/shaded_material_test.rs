use std::sync::{Arc, PoisonError};

use flight_entity::Entity;
use flight_materials::{BLEND_MODE_ADD, BLEND_MODE_NORMAL, MaterialAlphaMode};
use flight_shading::*;

use crate::{modifier_ref, texture_ref};

fn options() -> ShadedMaterialOptions {
    return ShadedMaterialOptions {
        alpha_cutoff: None,
        alpha_mode: None,
        blend_mode: None,
        double_sided: None,
        diffuse: None,
        diffuse_map: None,
        modifiers: None,
        normal_map: None,
        normal_scale: None,
        shininess: None,
        specular: None,
        specular_map: None,
    };
}

mod create_shaded_material {
    use super::*;

    #[test]
    fn applies_provided_base_values_maps_and_modifier_stack() {
        let diffuse_map = texture_ref();
        let normal_map = texture_ref();
        let specular_map = texture_ref();
        let emissive = modifier_ref(create_emissive_modifier(&EmissiveModifierOptions {
            color: 0xffaa_00ff,
            strength: None,
            mask: None,
            facing: None,
            facing_softness: None,
        }));
        let rim = modifier_ref(create_rim_modifier(&RimModifierOptions {
            color: 0x88bb_ffff,
            power: None,
            intensity: None,
            bias: None,
        }));
        let modifiers = vec![emissive.clone(), rim.clone()];
        let material = create_shaded_material(Some(&ShadedMaterialOptions {
            alpha_cutoff: None,
            alpha_mode: None,
            blend_mode: None,
            double_sided: None,
            diffuse: Some(0x1020_30ff),
            diffuse_map: Some(diffuse_map.clone()),
            modifiers: Some(modifiers),
            normal_map: Some(normal_map.clone()),
            normal_scale: Some(0.75),
            shininess: Some(8.0),
            specular: Some(0xaabb_ccff),
            specular_map: Some(specular_map.clone()),
        }));

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

        let material = create_shaded_material(None);
        assert_eq!(material.kind, SHADED_MATERIAL_KIND);
        assert_entity(&material);
    }

    #[test]
    fn defaults_the_lit_base_and_modifier_stack() {
        let material = create_shaded_material(None);
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
        let material = create_shaded_material(None);
        assert_eq!(material.name, None);
        assert_eq!(material.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(material.alpha_cutoff, 0.5);
        assert_eq!(material.blend_mode, BLEND_MODE_NORMAL);
        assert!(!material.double_sided);
    }

    #[test]
    fn forwards_the_material3d_trailer() {
        let mut provided = options();
        provided.alpha_cutoff = Some(0.25);
        provided.alpha_mode = Some(MaterialAlphaMode::Mask);
        provided.blend_mode = Some(BLEND_MODE_ADD.to_string());
        provided.double_sided = Some(true);
        let material = create_shaded_material(Some(&provided));

        assert_eq!(material.alpha_cutoff, 0.25);
        assert_eq!(material.alpha_mode, MaterialAlphaMode::Mask);
        assert_eq!(material.blend_mode, BLEND_MODE_ADD);
        assert!(material.double_sided);
    }
}

mod initialize_shaded_material {
    use super::*;

    #[test]
    fn resets_a_preallocated_material() {
        let mut material = create_shaded_material(None);
        material.diffuse = 0;
        material.modifiers = vec![modifier_ref(create_toon_modifier(&ToonModifierOptions {
            steps: 4.0,
            smoothness: None,
        }))];
        material.alpha_mode = MaterialAlphaMode::Blend;

        initialize_shaded_material(&mut material, &options());

        assert_eq!(material.kind, SHADED_MATERIAL_KIND);
        assert_eq!(material.diffuse, 0xffff_ffff);
        assert!(material.modifiers.is_empty());
        assert_eq!(material.alpha_mode, MaterialAlphaMode::Opaque);
    }
}
