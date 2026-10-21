use std::sync::{Arc, RwLock};

use flight_lighting::contract::*;

// flight-lint: allow-file(test-default-call) D12 scene options are plain partial records and intentionally have no create factory

mod create_scene_3d_lights {
    use super::*;

    #[test]
    fn fills_every_absent_slot() {
        let lights = create_scene_3d_lights(None);
        assert!(lights.ambient.is_none());
        assert!(lights.directional.is_none());
        assert!(lights.hemisphere.is_empty());
        assert!(lights.point.is_empty());
        assert!(lights.spot.is_empty());
    }

    #[test]
    fn preserves_provided_descriptor_identities_and_order() {
        let ambient = Arc::new(RwLock::new(create_ambient_light(Some(
            &AmbientLightOptions {
                intensity: Some(0.2),
                ..crate::ambient_options()
            },
        ))));
        let directional = Arc::new(RwLock::new(create_directional_light(Some(
            &DirectionalLightOptions {
                intensity: Some(3.0),
                ..crate::directional_options()
            },
        ))));
        let point = Arc::new(RwLock::new(create_point_light(None)));
        let lights = create_scene_3d_lights(Some(&Scene3DLightsOptions {
            ambient: Some(ambient.clone()),
            directional: Some(directional.clone()),
            point: Some(vec![point.clone()]),
            ..crate::scene_options()
        }));
        assert!(Arc::ptr_eq(lights.ambient.as_ref().unwrap(), &ambient));
        assert!(Arc::ptr_eq(
            lights.directional.as_ref().unwrap(),
            &directional
        ));
        assert!(Arc::ptr_eq(&lights.point[0], &point));
        assert!(lights.spot.is_empty());
    }
}

mod initialize_scene_3d_lights {
    use super::*;

    #[test]
    fn resets_omitted_arrays_to_empty_instead_of_retaining_them() {
        let point = Arc::new(RwLock::new(create_point_light(None)));
        let mut lights = create_scene_3d_lights(Some(&Scene3DLightsOptions {
            point: Some(vec![point]),
            ..crate::scene_options()
        }));
        initialize_scene_3d_lights(&mut lights, None);
        assert!(lights.point.is_empty());
        assert!(lights.directional.is_none());
    }
}
