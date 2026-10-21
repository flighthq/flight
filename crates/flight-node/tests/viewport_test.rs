use flight_node::contract::*;

// D23 (B): a viewport is created at the zero rect, then assigned (Principal 21f7557f).
fn viewport_of(x: f32, y: f32, width: f32, height: f32) -> Viewport {
    let mut viewport = create_viewport();
    viewport.x = x;
    viewport.y = y;
    viewport.width = width;
    viewport.height = height;
    return viewport;
}

mod create_viewport {
    use super::*;

    #[test]
    fn returns_a_zero_rect_at_unit_device_pixel_ratio_by_default() {
        let viewport = create_viewport();
        assert_eq!(
            (viewport.x, viewport.y, viewport.width, viewport.height),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(viewport.device_pixel_ratio, 1.0);
    }

    #[test]
    fn takes_overrides_by_assignment_after_create() {
        let mut viewport = viewport_of(10.0, 20.0, 800.0, 600.0);
        viewport.device_pixel_ratio = 2.0;
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
        assert!(
            (get_viewport_aspect(&viewport_of(0.0, 0.0, 800.0, 600.0)) - 800.0 / 600.0).abs()
                <= 1e-6
        );
    }

    #[test]
    fn returns_one_for_a_zero_height_rect() {
        assert_eq!(get_viewport_aspect(&viewport_of(0.0, 0.0, 800.0, 0.0)), 1.0);
    }
}

mod initialize_viewport {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_viewport() {
        let mut viewport = viewport_of(3.0, 4.0, 5.0, 6.0);
        viewport.device_pixel_ratio = 2.0;
        initialize_viewport(&mut viewport);
        assert_eq!(
            (viewport.x, viewport.y, viewport.width, viewport.height),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(viewport.device_pixel_ratio, 1.0);
    }
}
