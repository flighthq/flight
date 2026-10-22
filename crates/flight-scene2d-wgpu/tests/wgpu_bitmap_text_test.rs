use flight_node::NodeRef;
use flight_render::{BatchFormat, get_or_create_render_proxy_2d};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

mod wgpu_bitmap_text_renderer {
    use super::*;

    #[test]
    fn has_create_data_and_submit_functions() {
        assert_eq!(WGPU_BITMAP_TEXT_RENDERER.format, Some(BatchFormat::Quad));
        assert!(WGPU_BITMAP_TEXT_RENDERER.destroy_data.is_none());
    }

    #[test]
    fn submit_does_not_panic_for_a_text_node_with_no_bound_glyph_pages() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        let text: NodeRef = flight_bitmaptext::create_bitmap_text(None);
        let mut proxies = prepare_test_scene(&mut state, &text);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &text);
        (WGPU_BITMAP_TEXT_RENDERER.submit)(&mut state, proxy);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_count,
            0
        );
        submit_wgpu_frame(&mut state);
    }
}
