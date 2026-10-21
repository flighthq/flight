use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_shading::contract::*;

fn options(threshold: f32) -> DissolveModifierOptions {
    return DissolveModifierOptions {
        threshold,
        edge_color: None,
        edge_width: None,
        map: None,
        scale: None,
    };
}

mod create_dissolve_modifier {
    use super::*;

    #[test]
    fn applies_provided_edge_and_texture_values() {
        let map = crate::texture_ref();
        let modifier = create_dissolve_modifier(&DissolveModifierOptions {
            threshold: 0.5,
            edge_color: Some(0x00ff_ddff),
            edge_width: Some(0.1),
            map: Some(map.clone()),
            scale: Some(3.0),
        });
        assert!(Arc::ptr_eq(modifier.map.as_ref().unwrap(), &map));
        assert_eq!(modifier.edge_color, 0x00ff_ddff);
        assert_eq!(modifier.edge_width, 0.1);
        assert_eq!(modifier.scale, 3.0);
    }

    #[test]
    fn defaults_the_edge_and_noise_scale() {
        let modifier = create_dissolve_modifier(&options(0.3));
        assert_eq!(modifier.threshold, 0.3);
        assert_eq!(modifier.edge_color, 0xff66_00ff);
        assert_eq!(modifier.edge_width, 0.05);
        assert_eq!(modifier.scale, 8.0);
        assert!(modifier.map.is_none());
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_dissolve_modifier(&options(0.5));
        assert_eq!(modifier.kind, DISSOLVE_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_dissolve_modifier(&options(0.5));
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_dissolve_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: DissolveModifier = allocate_entity();
        initialize_dissolve_modifier(&mut out, &options(0.75));
        assert_eq!(out.kind, DISSOLVE_MODIFIER_KIND);
        assert_eq!(out.threshold, 0.75);
    }
}
