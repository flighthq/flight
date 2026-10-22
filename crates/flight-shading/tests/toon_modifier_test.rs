use flight_entity::{get_entity_uid, set_entity_uid};
use flight_shading::contract::*;

mod create_toon_modifier {
    use super::*;

    #[test]
    fn applies_provided_smoothness() {
        let mut modifier = create_toon_modifier();
        modifier.steps = 2.0;
        modifier.smoothness = 0.2;
        assert_eq!(modifier.smoothness, 0.2);
    }

    #[test]
    fn carries_steps_and_defaults_smoothness() {
        let mut modifier = create_toon_modifier();
        modifier.steps = 4.0;
        assert_eq!(modifier.steps, 4.0);
        assert_eq!(modifier.smoothness, 0.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_toon_modifier();
        assert_eq!(modifier.kind, TOON_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_toon_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_toon_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_toon_modifier();
        out.steps = 4.0;
        out.smoothness = 0.2;
        set_entity_uid(&mut out, "toon".to_string());
        initialize_toon_modifier(&mut out);
        assert_eq!(out.kind, TOON_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_EFFECT);
        assert_eq!(out.steps, 0.0);
        assert_eq!(out.smoothness, 0.0);
        assert_eq!(get_entity_uid(&mut out), "toon");
    }
}
