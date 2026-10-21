use flight_entity::allocate_entity;
use flight_shading::contract::*;

fn options(steps: f32) -> ToonModifierOptions {
    return ToonModifierOptions {
        steps,
        smoothness: None,
    };
}

mod create_toon_modifier {
    use super::*;

    #[test]
    fn applies_provided_smoothness() {
        let modifier = create_toon_modifier(&ToonModifierOptions {
            steps: 2.0,
            smoothness: Some(0.2),
        });
        assert_eq!(modifier.smoothness, 0.2);
    }

    #[test]
    fn carries_steps_and_defaults_smoothness() {
        let modifier = create_toon_modifier(&options(4.0));
        assert_eq!(modifier.steps, 4.0);
        assert_eq!(modifier.smoothness, 0.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_toon_modifier(&options(3.0));
        assert_eq!(modifier.kind, TOON_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_toon_modifier(&options(3.0));
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_toon_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: ToonModifier = allocate_entity();
        initialize_toon_modifier(&mut out, &options(4.0));
        assert_eq!(out.kind, TOON_MODIFIER_KIND);
        assert_eq!(out.steps, 4.0);
    }
}
