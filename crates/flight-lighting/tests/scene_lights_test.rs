use std::sync::{Arc, RwLock};

use flight_lighting::contract::*;

mod create_scene_3d_lights {
    use super::*;

    #[test]
    fn fills_every_absent_slot() {
        let lights = create_scene_3d_lights();
        assert!(lights.ambient.is_none());
        assert!(lights.directional.is_none());
        assert!(lights.hemisphere.is_empty());
        assert!(lights.point.is_empty());
        assert!(lights.spot.is_empty());
    }

    #[test]
    fn preserves_provided_descriptor_identities_and_order() {
        let mut ambient_value = create_ambient_light();
        ambient_value.intensity = 0.2;
        let ambient = Arc::new(RwLock::new(ambient_value));
        let directional = Arc::new(RwLock::new(create_directional_light(Some(
            &DirectionalLightOptions {
                intensity: Some(3.0),
                ..crate::directional_options()
            },
        ))));
        let point = Arc::new(RwLock::new(create_point_light()));
        let mut lights = create_scene_3d_lights();
        lights.ambient = Some(ambient.clone());
        lights.directional = Some(directional.clone());
        lights.point = vec![point.clone()];
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
        let point = Arc::new(RwLock::new(create_point_light()));
        let mut lights = create_scene_3d_lights();
        lights.point = vec![point];
        initialize_scene_3d_lights(&mut lights);
        assert!(lights.point.is_empty());
        assert!(lights.directional.is_none());
    }
}
