use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

mod draw_wgpu_text_input_overlay {
    use super::*;

    #[test]
    fn draws_selection_and_caret_chrome_directly_onto_a_context() {
        let input = create_test_rich_text("hi", 100.0, 40.0);
        flight_textinput::enable_text_input(&input, None)
            .write()
            .unwrap()
            .focused = true;
        let context = create_test_canvas_2d_context();
        let erased: std::sync::Arc<dyn Canvas2DContext> = context.clone();
        let handle = create_canvas_2d_context_handle(test_provider(), erased);
        let layout = flight_textlayout::contract::create_text_layout_result();

        draw_wgpu_text_input_overlay(&handle, &input, &layout, 100.0, 40.0, "hi");

        assert_eq!(context.count("save"), 1);
        assert_eq!(context.count("restore"), 1);
        assert_eq!(context.count("clip"), 1);
    }

    #[test]
    fn is_the_installed_overlay_function() {
        let mut state = create_wgpu_render_state_for_test(None);
        enable_wgpu_text_input(&mut state);
        let editable = create_test_rich_text("hi", 100.0, 40.0);
        flight_textinput::enable_text_input(&editable, None);
        open_test_screen_pass(&mut state);
        let record = set_test_hosts(&mut state);
        let proxy = create_test_rich_text_proxy(&mut state, &editable);
        draw_wgpu_rich_text(&mut state, &proxy);
        // Unfocused and not always-showing: the overlay returns before touching the canvas, so only
        // the field's own glyph pass saved and restored it.
        assert_eq!(record.last_context().count("save"), 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn rasterizes_a_caret_for_a_focused_editable_field() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        enable_wgpu_text_input(&mut state);
        let input = create_test_rich_text("hi", 100.0, 40.0);
        flight_textinput::enable_text_input(&input, None)
            .write()
            .unwrap()
            .focused = true;
        let proxy = create_test_rich_text_proxy(&mut state, &input);

        draw_wgpu_rich_text(&mut state, &proxy);

        let calls = record.last_context().calls();
        let caret = calls
            .iter()
            .filter(|call| call.starts_with("fillRect(") && call.contains(",1,"))
            .count();
        assert_eq!(caret, 1);
        assert!(calls.contains(&"globalAlpha=1".to_string()));
        submit_wgpu_frame(&mut state);
    }
}

mod enable_wgpu_text_input {
    use super::*;

    #[test]
    fn installs_the_overlay_on_the_state() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let input = create_test_rich_text("hi", 100.0, 40.0);
        flight_textinput::enable_text_input(&input, None)
            .write()
            .unwrap()
            .focused = true;
        let proxy = create_test_rich_text_proxy(&mut state, &input);
        draw_wgpu_rich_text(&mut state, &proxy);
        let without = record.last_context().count("restore");

        enable_wgpu_text_input(&mut state);
        let input = create_test_rich_text("hi", 100.0, 40.0);
        flight_textinput::enable_text_input(&input, None)
            .write()
            .unwrap()
            .focused = true;
        let proxy = create_test_rich_text_proxy(&mut state, &input);
        draw_wgpu_rich_text(&mut state, &proxy);

        assert_eq!(record.last_context().count("restore"), without + 1);
        submit_wgpu_frame(&mut state);
    }
}
