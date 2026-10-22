mod create_gl_render_view_resources {
    use crate::gl_test_helper::make_context_state;
    use flight_render_gl::create_gl_render_view_resources;
    #[test]
    fn creates_matching_target_viewport_and_pixel_ratio() {
        let resources =
            create_gl_render_view_resources(make_context_state(), 640.0, 480.0, 2.0, None, None)
                .unwrap();
        assert_eq!(
            (
                resources.render_target.axes.width,
                resources.render_target.axes.height
            ),
            (640, 480)
        );
        assert_eq!(
            (resources.viewport.width, resources.viewport.height),
            (640.0, 480.0)
        );
        assert_eq!(resources.viewport.device_pixel_ratio, 2.0);
        assert_eq!(resources.render_state.render.pixel_ratio, 2.0);
        assert_ne!(flight_entity::get_entity_id(&resources.render_state), 0);
        assert_ne!(flight_entity::get_entity_id(&resources.render_target), 0);
        assert_ne!(flight_entity::get_entity_id(&resources.viewport), 0);
    }
}
mod destroy_gl_render_view_resources {
    use crate::gl_test_helper::make_context_state;
    use flight_render_gl::{create_gl_render_view_resources, destroy_gl_render_view_resources};
    #[test]
    fn destroys_both_target_and_state_idempotently() {
        let mut resources =
            create_gl_render_view_resources(make_context_state(), 2.0, 2.0, 1.0, None, None)
                .unwrap();
        destroy_gl_render_view_resources(&mut resources);
        assert!(resources.render_target.destroyed);
        assert!(resources.render_state.gl_runtime.borrow().destroyed);
    }
}
mod resize_gl_render_view_resources {
    use crate::gl_test_helper::make_context_state;
    use flight_render_gl::{create_gl_render_view_resources, resize_gl_render_view_resources};
    #[test]
    fn is_idempotent_at_the_extent_storage_already_holds() {
        let mut resources =
            create_gl_render_view_resources(make_context_state(), 640.0, 480.0, 1.0, None, None)
                .unwrap();
        let texture = resources.render_target.texture;
        resize_gl_render_view_resources(&mut resources, 640.0, 480.0).unwrap();
        assert_eq!(resources.render_target.texture, texture);
        assert_eq!(resources.render_target.axes.width, 640);
        assert_eq!(resources.render_target.axes.height, 480);
    }

    #[test]
    fn resizes_storage_and_logical_viewport_together() {
        let mut resources =
            create_gl_render_view_resources(make_context_state(), 2.0, 2.0, 1.0, None, None)
                .unwrap();
        resize_gl_render_view_resources(&mut resources, 7.2, 8.4).unwrap();
        assert_eq!(
            (
                resources.render_target.axes.width,
                resources.render_target.axes.height
            ),
            (8, 9)
        );
        assert_eq!(
            (resources.viewport.width, resources.viewport.height),
            (7.2, 8.4)
        );
    }
}
