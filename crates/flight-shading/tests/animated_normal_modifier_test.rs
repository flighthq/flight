use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_geometry::create_vector2;
use flight_shading::contract::*;

fn options() -> AnimatedNormalModifierOptions {
    return AnimatedNormalModifierOptions {
        map: None,
        scroll: create_vector2(0.1, 0.0),
        strength: None,
        secondary_map: None,
        secondary_scroll: None,
    };
}

mod create_animated_normal_modifier {
    use super::*;

    #[test]
    fn accepts_a_null_map_as_the_disabled_variant() {
        assert!(create_animated_normal_modifier(&options()).map.is_none());
    }

    #[test]
    fn carries_the_optional_dual_scroll_layer() {
        let secondary_map = crate::texture_ref();
        let secondary_scroll = create_vector2(-0.05, 0.02);
        let modifier = create_animated_normal_modifier(&AnimatedNormalModifierOptions {
            map: Some(crate::texture_ref()),
            scroll: create_vector2(0.1, 0.0),
            strength: Some(0.5),
            secondary_map: Some(secondary_map.clone()),
            secondary_scroll: Some(secondary_scroll.clone()),
        });
        assert_eq!(modifier.strength, 0.5);
        assert!(Arc::ptr_eq(
            modifier.secondary_map.as_ref().unwrap(),
            &secondary_map
        ));
        assert_eq!(modifier.secondary_scroll, Some(secondary_scroll));
    }

    #[test]
    fn defaults_strength_and_omits_the_second_layer() {
        let modifier = create_animated_normal_modifier(&options());
        assert_eq!(modifier.strength, 1.0);
        assert!(modifier.secondary_map.is_none());
        assert!(modifier.secondary_scroll.is_none());
    }

    #[test]
    fn keeps_texture_identity_and_copies_scroll_value() {
        let map = crate::texture_ref();
        let scroll = create_vector2(0.1, 0.0);
        let modifier = create_animated_normal_modifier(&AnimatedNormalModifierOptions {
            map: Some(map.clone()),
            scroll: scroll.clone(),
            strength: None,
            secondary_map: None,
            secondary_scroll: None,
        });
        assert!(Arc::ptr_eq(modifier.map.as_ref().unwrap(), &map));
        assert_eq!(modifier.scroll, scroll);
        assert!(!std::ptr::eq(&modifier.scroll, &scroll));
    }

    #[test]
    fn sets_the_canonical_kind_and_normal_slot() {
        let modifier = create_animated_normal_modifier(&options());
        assert_eq!(modifier.kind, ANIMATED_NORMAL_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_NORMAL);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_animated_normal_modifier(&options());
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_NORMAL);
    }
}

mod initialize_animated_normal_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: AnimatedNormalModifier = allocate_entity();
        initialize_animated_normal_modifier(&mut out, &options());
        assert_eq!(out.kind, ANIMATED_NORMAL_MODIFIER_KIND);
        assert_eq!(out.strength, 1.0);
    }
}
