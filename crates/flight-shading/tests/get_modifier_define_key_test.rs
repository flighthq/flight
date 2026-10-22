use flight_entity::Ref;
use flight_shading::contract::*;

fn animated(
    map: Option<flight_entity::Ref<flight_texture::Texture>>,
    secondary_map: Option<flight_entity::Ref<flight_texture::Texture>>,
) -> Ref<dyn Modifier> {
    let mut modifier = create_animated_normal_modifier();
    modifier.map = map;
    modifier.secondary_map = secondary_map;
    return crate::modifier_ref(modifier);
}

fn emissive(
    color: u32,
    strength: Option<f32>,
    mask: Option<flight_entity::Ref<flight_texture::Texture>>,
    facing: Option<EmissiveModifierFacing>,
) -> Ref<dyn Modifier> {
    let mut modifier = create_emissive_modifier();
    modifier.color = color;
    if let Some(strength) = strength {
        modifier.strength = strength;
    }
    modifier.mask = mask;
    if let Some(facing) = facing {
        modifier.facing = facing;
    }
    return crate::modifier_ref(modifier);
}

fn rim(color: u32) -> Ref<dyn Modifier> {
    let mut modifier = create_rim_modifier();
    modifier.color = color;
    return crate::modifier_ref(modifier);
}

fn registry() -> ModifierRegistry {
    let mut registry = create_modifier_registry();
    register_built_in_modifiers(&mut registry);
    return registry;
}

mod get_modifier_define_key {
    use super::*;

    #[test]
    fn captures_compile_time_variants_but_not_uniform_scalars() {
        let registry = registry();
        let plain = emissive(0xffff_ffff, None, None, None);
        let stronger = emissive(0x00ff_00ff, Some(9.0), None, None);
        let masked = emissive(0xffff_ffff, None, Some(crate::texture_ref()), None);
        let gated = emissive(
            0xffff_ffff,
            None,
            None,
            Some(EmissiveModifierFacing::AwayFromLight),
        );
        let both = emissive(
            0xffff_ffff,
            None,
            Some(crate::texture_ref()),
            Some(EmissiveModifierFacing::TowardLight),
        );
        assert_eq!(
            get_modifier_define_key(&[plain], Some(&registry)),
            "EmissiveModifier"
        );
        assert_eq!(
            get_modifier_define_key(&[stronger], Some(&registry)),
            "EmissiveModifier"
        );
        assert_eq!(
            get_modifier_define_key(&[masked], Some(&registry)),
            "EmissiveModifier:m"
        );
        assert_eq!(
            get_modifier_define_key(&[gated], Some(&registry)),
            "EmissiveModifier:g"
        );
        assert_eq!(
            get_modifier_define_key(&[both], Some(&registry)),
            "EmissiveModifier:mg"
        );
    }

    #[test]
    fn distinguishes_disabled_single_and_dual_normal_variants() {
        let registry = registry();
        let disabled = animated(None, None);
        let single = animated(Some(crate::texture_ref()), None);
        let dual = animated(Some(crate::texture_ref()), Some(crate::texture_ref()));
        assert_eq!(
            get_modifier_define_key(&[disabled], Some(&registry)),
            "AnimatedNormalModifier:0"
        );
        assert_eq!(
            get_modifier_define_key(&[single], Some(&registry)),
            "AnimatedNormalModifier:1"
        );
        assert_eq!(
            get_modifier_define_key(&[dual], Some(&registry)),
            "AnimatedNormalModifier:2"
        );
    }

    #[test]
    fn falls_back_to_bare_kinds_without_a_registry() {
        let masked = emissive(0xffff_ffff, None, Some(crate::texture_ref()), None);
        assert_eq!(get_modifier_define_key(&[masked], None), "EmissiveModifier");
    }

    #[test]
    fn is_stable_regardless_of_cross_slot_authoring_order() {
        let registry = registry();
        let normal = animated(Some(crate::texture_ref()), None);
        let rim = rim(0xffff_ffff);
        assert_eq!(
            get_modifier_define_key(&[normal.clone(), rim.clone()], Some(&registry)),
            get_modifier_define_key(&[rim, normal], Some(&registry))
        );
    }

    #[test]
    fn joins_slot_ordered_kinds_with_plus() {
        let registry = registry();
        let normal = animated(Some(crate::texture_ref()), None);
        let emissive = emissive(0xffff_ffff, None, None, None);
        let rim = rim(0xffff_ffff);
        assert_eq!(
            get_modifier_define_key(&[rim, emissive, normal], Some(&registry)),
            "AnimatedNormalModifier:1+EmissiveModifier+RimModifier"
        );
    }

    #[test]
    fn reflects_per_slot_count_and_order() {
        let registry = registry();
        assert_eq!(
            get_modifier_define_key(&[rim(0x1111_11ff), rim(0x2222_22ff)], Some(&registry)),
            "RimModifier+RimModifier"
        );
    }

    #[test]
    fn returns_the_empty_string_for_an_empty_stack() {
        assert_eq!(get_modifier_define_key(&[], Some(&registry())), "");
    }
}
