use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_geometry::create_vector3;
use flight_shading::contract::*;

fn options(source: VertexDisplaceModifierSource, amplitude: f32) -> VertexDisplaceModifierOptions {
    return VertexDisplaceModifierOptions {
        source,
        amplitude,
        axis: None,
        map: None,
        frequency: None,
        speed: None,
        direction: None,
    };
}

mod create_vertex_displace_modifier {
    use super::*;

    #[test]
    fn applies_provided_wave_scalars_and_direction() {
        let direction = create_vector3(0.0, 0.0, 1.0);
        let modifier = create_vertex_displace_modifier(&VertexDisplaceModifierOptions {
            source: VertexDisplaceModifierSource::Sine,
            amplitude: 0.5,
            axis: None,
            map: None,
            frequency: Some(3.0),
            speed: Some(2.0),
            direction: Some(direction.clone()),
        });
        assert_eq!(modifier.frequency, 3.0);
        assert_eq!(modifier.speed, 2.0);
        assert_eq!(modifier.direction, direction);
        assert!(!std::ptr::eq(&modifier.direction, &direction));
    }

    #[test]
    fn defaults_the_sine_wave_and_leaves_axis_and_map_absent() {
        let modifier =
            create_vertex_displace_modifier(&options(VertexDisplaceModifierSource::Sine, 0.2));
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
        let modifier = create_vertex_displace_modifier(&VertexDisplaceModifierOptions {
            source: VertexDisplaceModifierSource::HeightMap,
            amplitude: 1.0,
            axis: Some(axis.clone()),
            map: Some(map.clone()),
            frequency: None,
            speed: None,
            direction: None,
        });
        assert_eq!(modifier.source, VertexDisplaceModifierSource::HeightMap);
        assert_eq!(modifier.axis, Some(axis));
        assert!(Arc::ptr_eq(modifier.map.as_ref().unwrap(), &map));
    }

    #[test]
    fn sets_the_canonical_kind_and_vertex_slot() {
        let modifier =
            create_vertex_displace_modifier(&options(VertexDisplaceModifierSource::Sine, 0.1));
        assert_eq!(modifier.kind, VERTEX_DISPLACE_MODIFIER_KIND);
        assert_eq!(modifier.slot, MODIFIER_SLOT_VERTEX);
    }

    #[test]
    fn satisfies_the_open_modifier_contract() {
        let modifier =
            create_vertex_displace_modifier(&options(VertexDisplaceModifierSource::Sine, 0.1));
        let base: &dyn Modifier = &modifier;
        assert_eq!(base.modifier_fields().slot, MODIFIER_SLOT_VERTEX);
    }
}

mod initialize_vertex_displace_modifier {
    use super::*;

    #[test]
    fn resets_a_preallocated_modifier() {
        let mut out: VertexDisplaceModifier = allocate_entity();
        initialize_vertex_displace_modifier(
            &mut out,
            &options(VertexDisplaceModifierSource::HeightMap, 2.0),
        );
        assert_eq!(out.kind, VERTEX_DISPLACE_MODIFIER_KIND);
        assert_eq!(out.amplitude, 2.0);
    }
}
