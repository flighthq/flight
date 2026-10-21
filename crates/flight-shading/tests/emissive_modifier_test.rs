use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_shading::contract::*;

fn options(color: u32) -> EmissiveModifierOptions {
    return EmissiveModifierOptions {
        color,
        strength: None,
        mask: None,
        facing: None,
        facing_softness: None,
    };
}

mod create_emissive_modifier {
    use super::*;

    #[test]
    fn applies_provided_scalars_and_facing_gate() {
        let modifier = create_emissive_modifier(&EmissiveModifierOptions {
            color: 0xffff_ffff,
            strength: Some(4.0),
            mask: None,
            facing: Some(EmissiveModifierFacing::AwayFromLight),
            facing_softness: Some(0.25),
        });
        assert_eq!(modifier.strength, 4.0);
        assert_eq!(modifier.facing, EmissiveModifierFacing::AwayFromLight);
        assert_eq!(modifier.facing_softness, 0.25);
    }

    #[test]
    fn carries_the_packed_rgba_color() {
        assert_eq!(
            create_emissive_modifier(&options(0x1234_abff)).color,
            0x1234_abff
        );
    }

    #[test]
    fn defaults_uniforms_and_leaves_the_mask_absent() {
        let modifier = create_emissive_modifier(&options(0xffff_ffff));
        assert_eq!(modifier.strength, 1.0);
        assert_eq!(modifier.facing, EmissiveModifierFacing::Ignore);
        assert_eq!(modifier.facing_softness, 0.0);
        assert!(modifier.mask.is_none());
    }

    #[test]
    fn keeps_mask_texture_identity() {
        let mask = crate::texture_ref();
        let modifier = create_emissive_modifier(&EmissiveModifierOptions {
            color: 0xffff_ffff,
            strength: None,
            mask: Some(mask.clone()),
            facing: None,
            facing_softness: None,
        });
        assert!(Arc::ptr_eq(modifier.mask.as_ref().unwrap(), &mask));
    }

    #[test]
    fn sets_the_canonical_kind_and_emissive_slot() {
        let modifier = create_emissive_modifier(&options(0xffaa_00ff));
        assert_eq!(modifier.kind, EMISSIVE_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EMISSIVE);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_emissive_modifier(&options(0xffff_ffff));
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EMISSIVE);
    }
}

mod initialize_emissive_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: EmissiveModifier = allocate_entity();
        initialize_emissive_modifier(&mut out, &options(0xaabb_ccff));
        assert_eq!(out.kind, EMISSIVE_MODIFIER_KIND);
        assert_eq!(out.color, 0xaabb_ccff);
    }
}
