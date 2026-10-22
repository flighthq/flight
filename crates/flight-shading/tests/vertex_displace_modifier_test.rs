use std::sync::Arc;

use flight_entity::{get_entity_uid, set_entity_uid};
use flight_geometry::create_vector3;
use flight_shading::contract::*;

mod create_vertex_displace_modifier {
    use super::*;

    #[test]
    fn applies_provided_wave_scalars_and_direction() {
        let direction = create_vector3(0.0, 0.0, 1.0);
        let mut modifier = create_vertex_displace_modifier();
        modifier.amplitude = 0.5;
        modifier.frequency = 3.0;
        modifier.speed = 2.0;
        modifier.direction = direction.clone();
        assert_eq!(modifier.frequency, 3.0);
        assert_eq!(modifier.speed, 2.0);
        assert_eq!(modifier.direction, direction);
        assert!(!std::ptr::eq(&modifier.direction, &direction));
    }

    #[test]
    fn defaults_the_sine_wave_and_leaves_axis_and_map_absent() {
        let mut modifier = create_vertex_displace_modifier();
        modifier.amplitude = 0.2;
        assert_eq!(modifier.frequency, 1.0);
        assert_eq!(modifier.speed, 1.0);
        assert_eq!(modifier.direction, create_vector3(1.0, 0.0, 0.0));
        assert!(modifier.axis.is_none());
        assert!(modifier.map.is_none());
    }

    #[test]
    fn keeps_height_map_identity_and_copies_the_axis_value() {
        let axis = create_vector3(0.0, 1.0, 0.0);
        let map = crate::texture_ref();
        let mut modifier = create_vertex_displace_modifier();
        modifier.source = VertexDisplaceModifierSource::HeightMap;
        modifier.amplitude = 1.0;
        modifier.axis = Some(axis.clone());
        modifier.map = Some(map.clone());
        assert_eq!(modifier.source, VertexDisplaceModifierSource::HeightMap);
        assert_eq!(modifier.axis, Some(axis));
        assert!(Arc::ptr_eq(modifier.map.as_ref().unwrap(), &map));
    }

    #[test]
    fn sets_the_canonical_kind_and_vertex_slot() {
        let modifier = create_vertex_displace_modifier();
        assert_eq!(modifier.kind, VERTEX_DISPLACE_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_VERTEX);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier = create_vertex_displace_modifier();
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_VERTEX);
    }
}

mod initialize_vertex_displace_modifier {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = create_vertex_displace_modifier();
        out.source = VertexDisplaceModifierSource::HeightMap;
        out.amplitude = 2.0;
        out.axis = Some(create_vector3(0.0, 1.0, 0.0));
        out.map = Some(crate::texture_ref());
        out.frequency = 3.0;
        out.speed = 4.0;
        out.direction = create_vector3(0.0, 0.0, 1.0);
        set_entity_uid(&mut out, "vertex-displace".to_string());
        initialize_vertex_displace_modifier(&mut out);
        assert_eq!(out.kind, VERTEX_DISPLACE_MODIFIER_KIND);
        assert_eq!(out.slot, MODIFIER_SLOT_VERTEX);
        assert_eq!(out.source, VertexDisplaceModifierSource::Sine);
        assert_eq!(out.amplitude, 0.0);
        assert!(out.axis.is_none());
        assert!(out.map.is_none());
        assert_eq!(out.frequency, 1.0);
        assert_eq!(out.speed, 1.0);
        assert_eq!(out.direction, create_vector3(1.0, 0.0, 0.0));
        assert_eq!(get_entity_uid(&mut out), "vertex-displace");
    }
}
