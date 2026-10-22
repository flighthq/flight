use std::sync::Arc;

use flight_scene2d_gl::*;

use crate::gl_test_helper::{make_canvas_surface, surface_canvas};

mod create_canvas_2d_context_handle {
    use super::*;

    #[test]
    fn wraps_the_drawing_context_and_keeps_its_identity_as_the_platform_handle() {
        let surface = make_canvas_surface(4.0, 4.0);
        let canvas = surface_canvas(&surface);
        let context: Arc<dyn Canvas2DContext> = canvas.clone();
        let handle = create_canvas_2d_context_handle(Arc::new(()), Arc::clone(&context));
        let narrowed = handle
            .handle
            .downcast_ref::<Arc<dyn Canvas2DContext>>()
            .unwrap();
        assert!(Arc::ptr_eq(narrowed, &context));
    }
}
