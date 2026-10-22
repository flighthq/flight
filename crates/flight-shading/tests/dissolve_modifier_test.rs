use std::sync::Arc;

use flight_entity::{get_entity_uid, set_entity_uid};
use flight_shading::contract::*;

mod create_dissolve_modifier {
    use super::*;

    #[test]
    fn applies_provided_edge_and_texture_values() {
        let map = crate::texture_ref();
        let mut modifier = create_dissolve_modifier();
        modifier.threshold = 0.5;
        modifier.edge_color = 0x00ff_ddff;
        modifier.edge_width = 0.1;
        modifier.map = Some(map.clone());
        modifier.scale = 3.0;
        assert!(Arc::ptr_eq(modifier.map.as_ref().unwrap(), &map));
        assert_eq!(modifier.edge_color, 0x00ff_ddff);
        assert_eq!(modifier.edge_width, 0.1);
        assert_eq!(modifier.scale, 3.0);
    }

    #[test]
    fn defaults_the_edge_and_noise_scale() {
        let mut modifier = create_dissolve_modifier();
        modifier.threshold = 0.3;
        assert_eq!(modifier.threshold, 0.3);
        assert_eq!(modifier.edge_color, 0xff66_00ff);
        assert_eq!(modifier.edge_width, 0.05);
        assert_eq!(modifier.scale, 8.0);
        assert!(modifier.map.is_none());
    }

    #[test]
    fn sets_the_canonical_kind_and_effect_slot() {
        let modifier = create_dissolve_modifier();
        assert_eq!(modifier.kind, DISSOLVE_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_EFFECT);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_dissolve_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_EFFECT);
    }
}

mod initialize_dissolve_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_dissolve_modifier();
        out.threshold = 0.75;
        out.edge_color = 0;
        out.edge_width = 1.0;
        out.map = Some(crate::texture_ref());
        out.scale = 2.0;
        set_entity_uid(&mut out, "dissolve".to_string());
        initialize_dissolve_modifier(&mut out);
        assert_eq!(out.kind, DISSOLVE_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_EFFECT);
        assert_eq!(out.threshold, 0.0);
        assert_eq!(out.edge_color, 0xff66_00ff);
        assert_eq!(out.edge_width, 0.05);
        assert!(out.map.is_none());
        assert_eq!(out.scale, 8.0);
        assert_eq!(get_entity_uid(&mut out), "dissolve");
    }
}
