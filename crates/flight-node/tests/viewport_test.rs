use flight_node::contract::*;

mod create_viewport {
    use super::*;

    #[test]
    fn returns_a_zero_rect_at_unit_device_pixel_ratio_by_default() {
        let viewport = create_viewport(None);
        assert_eq!(
            (viewport.x, viewport.y, viewport.width, viewport.height),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(viewport.device_pixel_ratio, 1.0);
    }

    #[test]
    fn accepts_overrides() {
        let options = ViewportOptions {
            device_pixel_ratio: Some(2.0),
            height: Some(600.0),
            width: Some(800.0),
            x: Some(10.0),
            y: Some(20.0),
        };
        let viewport = create_viewport(Some(&options));
        assert_eq!(
            (viewport.x, viewport.y, viewport.width, viewport.height),
            (10.0, 20.0, 800.0, 600.0)
        );
        assert_eq!(viewport.device_pixel_ratio, 2.0);
    }
}

mod get_viewport_aspect {
    use super::*;

    #[test]
    fn returns_width_over_height_for_a_non_degenerate_rect() {
        let options = ViewportOptions {
            device_pixel_ratio: None,
            height: Some(600.0),
            width: Some(800.0),
            x: None,
            y: None,
        };
        assert!(
            (get_viewport_aspect(&create_viewport(Some(&options))) - 800.0 / 600.0).abs() <= 1e-6
        );
    }

    #[test]
    fn returns_one_for_a_zero_height_rect() {
        let options = ViewportOptions {
            device_pixel_ratio: None,
            height: Some(0.0),
            width: Some(800.0),
            x: None,
            y: None,
        };
        assert_eq!(get_viewport_aspect(&create_viewport(Some(&options))), 1.0);
    }
}

mod initialize_viewport {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_viewport() {
        let mut viewport = create_viewport(None);
        let options = ViewportOptions {
            device_pixel_ratio: None,
            height: None,
            width: Some(4.0),
            x: None,
            y: None,
        };
        initialize_viewport(&mut viewport, Some(&options));
        assert_eq!(viewport.width, 4.0);
        assert_eq!(viewport.height, 0.0);
    }
}
