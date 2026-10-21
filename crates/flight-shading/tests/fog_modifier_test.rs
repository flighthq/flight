use flight_entity::allocate_entity;
use flight_shading::contract::*;

fn options(color: u32) -> FogModifierOptions {
    return FogModifierOptions {
        color,
        mode: None,
        near: None,
        far: None,
        density: None,
    };
}

mod create_fog_modifier {
    use super::*;

    #[test]
    fn applies_provided_mode_and_scalars() {
        let modifier = create_fog_modifier(&FogModifierOptions {
            color: 0xffff_ffff,
            mode: Some(FogModifierMode::Exponential2),
            near: Some(4.0),
            far: Some(40.0),
            density: Some(0.05),
        });
        assert_eq!(modifier.mode, FogModifierMode::Exponential2);
        assert_eq!(modifier.near, 4.0);
        assert_eq!(modifier.far, 40.0);
        assert_eq!(modifier.density, 0.05);
    }

    #[test]
    fn carries_the_packed_rgba_color() {
        assert_eq!(
            create_fog_modifier(&options(0x1122_ddff)).color,
            0x1122_ddff
        );
    }

    #[test]
    fn defaults_to_a_linear_zero_to_one_ramp() {
        let modifier = create_fog_modifier(&options(0xffff_ffff));
        assert_eq!(modifier.mode, FogModifierMode::Linear);
        assert_eq!(modifier.near, 0.0);
        assert_eq!(modifier.far, 1.0);
        assert_eq!(modifier.density, 1.0);
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_fog_modifier(&options(0xaabb_ccff));
        assert_eq!(modifier.kind, FOG_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_fog_modifier(&options(0xffff_ffff));
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_fog_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: FogModifier = allocate_entity();
        initialize_fog_modifier(&mut out, &options(0xaabb_ccff));
        assert_eq!(out.kind, FOG_MODIFIER_KIND);
        assert_eq!(out.color, 0xaabb_ccff);
    }
}
