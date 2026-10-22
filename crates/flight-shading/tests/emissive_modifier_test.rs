use std::sync::Arc;

use flight_entity::{get_entity_uid, set_entity_uid};
use flight_shading::contract::*;

mod create_emissive_modifier {
    use super::*;

    #[test]
    fn applies_provided_scalars_and_facing_gate() {
        let mut modifier = create_emissive_modifier();
        modifier.color = 0xffff_ffff;
        modifier.strength = 4.0;
        modifier.facing = EmissiveModifierFacing::AwayFromLight;
        modifier.facing_softness = 0.25;
        assert_eq!(modifier.strength, 4.0);
        assert_eq!(modifier.facing, EmissiveModifierFacing::AwayFromLight);
        assert_eq!(modifier.facing_softness, 0.25);
    }

    #[test]
    fn carries_the_packed_rgba_color() {
        let mut modifier = create_emissive_modifier();
        modifier.color = 0x1234_abff;
        assert_eq!(modifier.color, 0x1234_abff);
    }

    #[test]
    fn defaults_uniforms_and_leaves_the_mask_absent() {
        let modifier = create_emissive_modifier();
        assert_eq!(modifier.strength, 1.0);
        assert_eq!(modifier.facing, EmissiveModifierFacing::Ignore);
        assert_eq!(modifier.facing_softness, 0.0);
        assert!(modifier.mask.is_none());
    }

    #[test]
    fn keeps_mask_texture_identity() {
        let mask = crate::texture_ref();
        let mut modifier = create_emissive_modifier();
        modifier.mask = Some(mask.clone());
        assert!(Arc::ptr_eq(modifier.mask.as_ref().unwrap(), &mask));
    }

    #[test]
    fn sets_the_canonical_kind_and_emissive_slot() {
        let modifier = create_emissive_modifier();
        assert_eq!(modifier.kind, EMISSIVE_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EMISSIVE);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_emissive_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EMISSIVE);
    }
}

mod initialize_emissive_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_emissive_modifier();
        out.color = 0xaabb_ccff;
        out.strength = 2.0;
        out.mask = Some(crate::texture_ref());
        out.facing = EmissiveModifierFacing::AwayFromLight;
        out.facing_softness = 0.5;
        set_entity_uid(&mut out, "emissive".to_string());
        initialize_emissive_modifier(&mut out);
        assert_eq!(out.kind, EMISSIVE_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_EMISSIVE);
        assert_eq!(out.color, 0);
        assert_eq!(out.strength, 1.0);
        assert!(out.mask.is_none());
        assert_eq!(out.facing, EmissiveModifierFacing::Ignore);
        assert_eq!(out.facing_softness, 0.0);
        assert_eq!(get_entity_uid(&mut out), "emissive");
    }
}
