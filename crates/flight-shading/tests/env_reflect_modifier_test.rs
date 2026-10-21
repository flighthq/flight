use flight_entity::allocate_entity;
use flight_shading::contract::*;

mod create_env_reflect_modifier {
    use super::*;

    #[test]
    fn applies_provided_scalars() {
        let modifier = create_env_reflect_modifier(Some(&EnvReflectModifierOptions {
            tint: Some(0x88cc_ffff),
            intensity: Some(0.5),
            fresnel_bias: Some(0.1),
            roughness: Some(0.6),
        }));
        assert_eq!(modifier.tint, 0x88cc_ffff);
        assert_eq!(modifier.intensity, 0.5);
        assert_eq!(modifier.fresnel_bias, 0.1);
        assert_eq!(modifier.roughness, 0.6);
    }

    #[test]
    fn defaults_to_a_mirror_sharp_white_dielectric_reflection() {
        let modifier = create_env_reflect_modifier(None);
        assert_eq!(modifier.tint, 0xffff_ffff);
        assert_eq!(modifier.intensity, 1.0);
        assert_eq!(modifier.fresnel_bias, 0.04);
        assert_eq!(modifier.roughness, 0.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_env_reflect_modifier(None);
        assert_eq!(modifier.kind, ENV_REFLECT_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_env_reflect_modifier(None);
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_env_reflect_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: EnvReflectModifier = allocate_entity();
        initialize_env_reflect_modifier(&mut out, None);
        assert_eq!(out.kind, ENV_REFLECT_MODIFIER_KIND);
        assert_eq!(out.intensity, 1.0);
    }
}
