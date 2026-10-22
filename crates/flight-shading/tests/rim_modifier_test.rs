use flight_entity::{get_entity_uid, set_entity_uid};
use flight_shading::contract::*;

mod create_rim_modifier {
    use super::*;

    #[test]
    fn applies_provided_falloff_scalars() {
        let mut modifier = create_rim_modifier();
        modifier.color = 0xffff_ffff;
        modifier.power = 5.0;
        modifier.intensity = 2.0;
        modifier.bias = 0.1;
        assert_eq!(modifier.power, 5.0);
        assert_eq!(modifier.intensity, 2.0);
        assert_eq!(modifier.bias, 0.1);
    }

    #[test]
    fn carries_the_packed_rgba_color() {
        let mut modifier = create_rim_modifier();
        modifier.color = 0x0102_03ff;
        assert_eq!(modifier.color, 0x0102_03ff);
    }

    #[test]
    fn defaults_the_falloff_scalars() {
        let modifier = create_rim_modifier();
        assert_eq!(modifier.power, 3.0);
        assert_eq!(modifier.intensity, 1.0);
        assert_eq!(modifier.bias, 0.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_rim_modifier();
        assert_eq!(modifier.kind, RIM_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_rim_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_rim_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_rim_modifier();
        out.color = 0xaabb_ccff;
        out.power = 5.0;
        out.intensity = 2.0;
        out.bias = 0.1;
        set_entity_uid(&mut out, "rim".to_string());
        initialize_rim_modifier(&mut out);
        assert_eq!(out.kind, RIM_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_EFFECT);
        assert_eq!(out.color, 0);
        assert_eq!(out.power, 3.0);
        assert_eq!(out.intensity, 1.0);
        assert_eq!(out.bias, 0.0);
        assert_eq!(get_entity_uid(&mut out), "rim");
    }
}
