use flight_entity::{get_entity_uid, set_entity_uid};
use flight_shading::contract::*;

mod create_fog_modifier {
    use super::*;

    #[test]
    fn applies_provided_mode_and_scalars() {
        let mut modifier = create_fog_modifier();
        modifier.color = 0xffff_ffff;
        modifier.mode = FogModifierMode::Exponential2;
        modifier.near = 4.0;
        modifier.far = 40.0;
        modifier.density = 0.05;
        assert_eq!(modifier.mode, FogModifierMode::Exponential2);
        assert_eq!(modifier.near, 4.0);
        assert_eq!(modifier.far, 40.0);
        assert_eq!(modifier.density, 0.05);
    }

    #[test]
    fn carries_the_packed_rgba_color() {
        let mut modifier = create_fog_modifier();
        modifier.color = 0x1122_ddff;
        assert_eq!(modifier.color, 0x1122_ddff);
    }

    #[test]
    fn defaults_to_a_linear_zero_to_one_ramp() {
        let modifier = create_fog_modifier();
        assert_eq!(modifier.mode, FogModifierMode::Linear);
        assert_eq!(modifier.near, 0.0);
        assert_eq!(modifier.far, 1.0);
        assert_eq!(modifier.density, 1.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_fog_modifier();
        assert_eq!(modifier.kind, FOG_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_fog_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_fog_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_fog_modifier();
        out.color = 0xaabb_ccff;
        out.mode = FogModifierMode::Exponential2;
        out.near = 4.0;
        out.far = 40.0;
        out.density = 0.05;
        set_entity_uid(&mut out, "fog".to_string());
        initialize_fog_modifier(&mut out);
        assert_eq!(out.kind, FOG_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_EFFECT);
        assert_eq!(out.color, 0);
        assert_eq!(out.mode, FogModifierMode::Linear);
        assert_eq!(out.near, 0.0);
        assert_eq!(out.far, 1.0);
        assert_eq!(out.density, 1.0);
        assert_eq!(get_entity_uid(&mut out), "fog");
    }
}
