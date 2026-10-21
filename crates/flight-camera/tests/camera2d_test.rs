use flight_camera::contract::*;

use crate::test_support::*;

mod create_camera_2d {
    use super::*;

    #[test]
    fn uses_identity_defaults_for_an_unconfigured_camera() {
        let camera = camera_2d(None);
        assert_eq!(camera.x, 0.0);
        assert_eq!(camera.y, 0.0);
        assert_eq!(camera.zoom, 1.0);
        assert_eq!(camera.rotation, 0.0);
    }

    #[test]
    fn applies_overrides_from_options() {
        let options = Camera2DOptions {
            rotation: Some(std::f32::consts::FRAC_PI_4),
            x: Some(10.0),
            y: Some(20.0),
            zoom: Some(2.0),
        };
        let camera = camera_2d(Some(&options));
        assert_eq!(camera.x, 10.0);
        assert_eq!(camera.y, 20.0);
        assert_eq!(camera.zoom, 2.0);
        assert_close(camera.rotation, std::f32::consts::FRAC_PI_4);
    }
}

mod initialize_camera_2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_camera_2d() {
        let mut camera = flight_entity::allocate_entity::<Camera2D>();
        let id = flight_entity::get_entity_id(&camera);
        camera.rotation = 2.0;
        camera.x = 3.0;
        camera.y = 4.0;
        camera.zoom = 5.0;
        initialize_camera_2d(&mut camera);
        assert_eq!(camera.rotation, 0.0);
        assert_eq!(camera.zoom, 1.0);
        assert_eq!(camera.x, 0.0);
        assert_eq!(camera.y, 0.0);
        assert_eq!(flight_entity::get_entity_id(&camera), id);
    }
}

mod set_camera_2d_look_at {
    use super::*;

    #[test]
    fn centers_the_camera_on_a_world_position() {
        let mut camera = camera_2d(None);
        set_camera_2d_look_at(&mut camera, 100.0, 200.0);
        assert_eq!(camera.x, 100.0);
        assert_eq!(camera.y, 200.0);
    }

    #[test]
    fn overwrites_a_previous_position() {
        let options = Camera2DOptions {
            rotation: None,
            x: Some(50.0),
            y: Some(60.0),
            zoom: None,
        };
        let mut camera = camera_2d(Some(&options));
        set_camera_2d_look_at(&mut camera, -10.0, 30.0);
        assert_eq!(camera.x, -10.0);
        assert_eq!(camera.y, 30.0);
    }
}
