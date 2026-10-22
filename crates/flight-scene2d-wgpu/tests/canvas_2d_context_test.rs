use std::sync::Arc;

use flight_scene2d_wgpu::*;

use crate::support::*;

mod create_canvas_2d_context_handle {
    use super::*;

    #[test]
    fn keeps_the_context_identity_as_the_handle_payload() {
        let context = create_test_canvas_2d_context();
        let erased: Arc<dyn Canvas2DContext> = context.clone();
        let handle = create_canvas_2d_context_handle(test_provider(), erased.clone());
        let narrowed = handle
            .handle
            .downcast_ref::<Arc<dyn Canvas2DContext>>()
            .unwrap();
        assert!(Arc::ptr_eq(narrowed, &erased));
        narrowed.fill_rect(1.0, 2.0, 3.0, 4.0);
        assert_eq!(context.calls(), vec!["fillRect(1,2,3,4)".to_string()]);
    }
}
