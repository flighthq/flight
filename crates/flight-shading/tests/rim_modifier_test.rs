use flight_entity::allocate_entity;
use flight_shading::contract::*;

fn options(color: u32) -> RimModifierOptions {
    return RimModifierOptions {
        color,
        power: None,
        intensity: None,
        bias: None,
    };
}

mod create_rim_modifier {
    use super::*;

    #[test]
    fn applies_provided_falloff_scalars() {
        let modifier = create_rim_modifier(&RimModifierOptions {
            color: 0xffff_ffff,
            power: Some(5.0),
            intensity: Some(2.0),
            bias: Some(0.1),
        });
        assert_eq!(modifier.power, 5.0);
        assert_eq!(modifier.intensity, 2.0);
        assert_eq!(modifier.bias, 0.1);
    }

    #[test]
    fn carries_the_packed_rgba_color() {
        assert_eq!(
            create_rim_modifier(&options(0x0102_03ff)).color,
            0x0102_03ff
        );
    }

    #[test]
    fn defaults_the_falloff_scalars() {
        let modifier = create_rim_modifier(&options(0xffff_ffff));
        assert_eq!(modifier.power, 3.0);
        assert_eq!(modifier.intensity, 1.0);
        assert_eq!(modifier.bias, 0.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_rim_modifier(&options(0x88cc_ffff));
        assert_eq!(modifier.kind, RIM_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_rim_modifier(&options(0xffff_ffff));
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_rim_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: RimModifier = allocate_entity();
        initialize_rim_modifier(&mut out, &options(0xaabb_ccff));
        assert_eq!(out.kind, RIM_MODIFIER_KIND);
        assert_eq!(out.color, 0xaabb_ccff);
    }
}
