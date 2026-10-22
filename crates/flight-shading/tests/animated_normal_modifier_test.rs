use std::sync::Arc;

use flight_entity::{get_entity_uid, set_entity_uid};
use flight_geometry::create_vector2;
use flight_shading::contract::*;

mod create_animated_normal_modifier {
    use super::*;

    #[test]
    fn accepts_a_null_map_as_the_disabled_variant() {
        assert!(create_animated_normal_modifier().map.is_none());
    }

    #[test]
    fn carries_the_optional_dual_scroll_layer() {
        let secondary_map = crate::texture_ref();
        let secondary_scroll = create_vector2(-0.05, 0.02);
        let mut modifier = create_animated_normal_modifier();
        modifier.map = Some(crate::texture_ref());
        modifier.scroll = create_vector2(0.1, 0.0);
        modifier.strength = 0.5;
        modifier.secondary_map = Some(secondary_map.clone());
        modifier.secondary_scroll = Some(secondary_scroll.clone());
        assert_eq!(modifier.strength, 0.5);
        assert!(Arc::ptr_eq(
            modifier.secondary_map.as_ref().unwrap(),
            &secondary_map
        ));
        assert_eq!(modifier.secondary_scroll, Some(secondary_scroll));
    }

    #[test]
    fn defaults_strength_and_omits_the_second_layer() {
        let modifier = create_animated_normal_modifier();
        assert_eq!(modifier.strength, 1.0);
        assert!(modifier.secondary_map.is_none());
        assert!(modifier.secondary_scroll.is_none());
    }

    #[test]
    fn keeps_texture_identity_and_copies_scroll_value() {
        let map = crate::texture_ref();
        let scroll = create_vector2(0.1, 0.0);
        let mut modifier = create_animated_normal_modifier();
        modifier.map = Some(map.clone());
        modifier.scroll = scroll.clone();
        assert!(Arc::ptr_eq(modifier.map.as_ref().unwrap(), &map));
        assert_eq!(modifier.scroll, scroll);
        assert!(!std::ptr::eq(&modifier.scroll, &scroll));
    }

    #[test]
    fn sets_the_canonical_kind_and_normal_slot() {
        let modifier = create_animated_normal_modifier();
        assert_eq!(modifier.kind, ANIMATED_NORMAL_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_NORMAL);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_animated_normal_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_NORMAL);
    }
}

mod initialize_animated_normal_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_animated_normal_modifier();
        out.map = Some(crate::texture_ref());
        out.scroll = create_vector2(1.0, 2.0);
        out.strength = 0.25;
        out.secondary_map = Some(crate::texture_ref());
        out.secondary_scroll = Some(create_vector2(3.0, 4.0));
        set_entity_uid(&mut out, "animated-normal".to_string());
        initialize_animated_normal_modifier(&mut out);
        assert_eq!(out.kind, ANIMATED_NORMAL_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_NORMAL);
        assert!(out.map.is_none());
        assert_eq!(out.scroll, create_vector2(0.0, 0.0));
        assert_eq!(out.strength, 1.0);
        assert!(out.secondary_map.is_none());
        assert!(out.secondary_scroll.is_none());
        assert_eq!(get_entity_uid(&mut out), "animated-normal");
    }
}
