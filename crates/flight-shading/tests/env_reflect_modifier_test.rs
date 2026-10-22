use flight_entity::{get_entity_uid, set_entity_uid};
use flight_shading::contract::*;

mod create_env_reflect_modifier {
    use super::*;

    #[test]
    fn applies_provided_scalars() {
        let mut modifier = create_env_reflect_modifier();
        modifier.tint = 0x88cc_ffff;
        modifier.intensity = 0.5;
        modifier.fresnel_bias = 0.1;
        modifier.roughness = 0.6;
        assert_eq!(modifier.tint, 0x88cc_ffff);
        assert_eq!(modifier.intensity, 0.5);
        assert_eq!(modifier.fresnel_bias, 0.1);
        assert_eq!(modifier.roughness, 0.6);
    }

    #[test]
    fn defaults_to_a_mirror_sharp_white_dielectric_reflection() {
        let modifier = create_env_reflect_modifier();
        assert_eq!(modifier.tint, 0xffff_ffff);
        assert_eq!(modifier.intensity, 1.0);
        assert_eq!(modifier.fresnel_bias, 0.04);
        assert_eq!(modifier.roughness, 0.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_env_reflect_modifier();
        assert_eq!(modifier.kind, ENV_REFLECT_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_env_reflect_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_env_reflect_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_env_reflect_modifier();
        out.tint = 0;
        out.intensity = 0.5;
        out.fresnel_bias = 1.0;
        out.roughness = 1.0;
        set_entity_uid(&mut out, "env-reflect".to_string());
        initialize_env_reflect_modifier(&mut out);
        assert_eq!(out.kind, ENV_REFLECT_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_EFFECT);
        assert_eq!(out.tint, 0xffff_ffff);
        assert_eq!(out.intensity, 1.0);
        assert_eq!(out.fresnel_bias, 0.04);
        assert_eq!(out.roughness, 0.0);
        assert_eq!(get_entity_uid(&mut out), "env-reflect");
    }
}
