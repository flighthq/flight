use std::sync::Arc;

use flight_entity::get_entity_id;
use flight_node::RendererDataRef;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

fn rich_data<T>(data: &RendererDataRef, read: impl FnOnce(&WgpuRichTextData) -> T) -> T {
    let guard = data.read().unwrap();
    return read(get_wgpu_renderer_data::<WgpuRichTextData>(Some(&*guard)).unwrap());
}

mod create_wgpu_rich_text_data {
    use super::*;

    #[test]
    fn starts_without_a_raster_surface_until_the_node_first_draws() {
        let mut state = create_wgpu_render_state_for_test(None);
        let node: flight_node::NodeRef = create_test_rich_text("", 10.0, 10.0);
        let data = create_wgpu_rich_text_data(&mut state, &node).unwrap();
        assert!(rich_data(&data, |data| data.surface.is_none()));
    }
}

mod destroy_wgpu_rich_text_data {
    use super::*;

    #[test]
    fn removes_the_gpu_cache_entry_before_returning_the_node_surface_to_its_creator() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let source = create_test_rich_text("owned", 100.0, 40.0);
        let mut proxy = create_test_rich_text_proxy(&mut state, &source);
        draw_wgpu_rich_text(&mut state, &proxy);
        let data = proxy.renderer_data.take().unwrap();
        let image = rich_data(&data, |data| data.image.clone().unwrap());
        let image_id = get_entity_id(&*image.read().unwrap());
        let context = get_wgpu_render_state_runtime(&state).context.clone();
        let entry = context
            .read()
            .unwrap()
            .texture_source_premultiplied_texture_cache
            .get(&image_id)
            .cloned()
            .unwrap();
        submit_wgpu_frame(&mut state);
        let destroyed_before = record.destroyed_count();

        destroy_wgpu_rich_text_data(&mut state, data);

        assert!(
            !context
                .read()
                .unwrap()
                .texture_source_premultiplied_texture_cache
                .contains_key(&image_id)
        );
        let native = get_wgpu_render_state_native_device(&state);
        assert!(is_test_texture_destroyed(
            &native,
            &entry.read().unwrap().texture
        ));
        assert_eq!(record.destroyed_count(), destroyed_before + 1);
    }

    #[test]
    fn is_a_no_op_when_no_surface_was_allocated() {
        let mut state = create_wgpu_render_state_for_test(None);
        let record = set_test_hosts(&mut state);
        let node: flight_node::NodeRef = create_test_rich_text("", 10.0, 10.0);
        let data = create_wgpu_rich_text_data(&mut state, &node).unwrap();
        destroy_wgpu_rich_text_data(&mut state, data);
        assert_eq!(record.destroyed_count(), 0);
    }
}

mod draw_wgpu_rich_text {
    use super::*;

    #[test]
    fn keeps_different_text_nodes_on_distinct_surfaces_and_gpu_textures_in_one_frame() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        let first = create_test_rich_text("first", 100.0, 40.0);
        let second = create_test_rich_text("second", 100.0, 40.0);
        let first_proxy = create_test_rich_text_proxy(&mut state, &first);
        let second_proxy = create_test_rich_text_proxy(&mut state, &second);

        draw_wgpu_rich_text(&mut state, &first_proxy);
        draw_wgpu_rich_text(&mut state, &second_proxy);

        let first_data = first_proxy.renderer_data.clone().unwrap();
        let second_data = second_proxy.renderer_data.clone().unwrap();
        let (first_surface, first_image) = rich_data(&first_data, |data| {
            (data.surface.clone().unwrap(), data.image.clone().unwrap())
        });
        let (second_surface, second_image) = rich_data(&second_data, |data| {
            (data.surface.clone().unwrap(), data.image.clone().unwrap())
        });
        assert!(!Arc::ptr_eq(&first_surface, &second_surface));
        assert!(!Arc::ptr_eq(&first_image, &second_image));
        let context = get_wgpu_render_state_runtime(&state).context.clone();
        let context = context.read().unwrap();
        let cache = &context.texture_source_premultiplied_texture_cache;
        let first_entry = cache
            .get(&get_entity_id(&*first_image.read().unwrap()))
            .unwrap();
        let second_entry = cache
            .get(&get_entity_id(&*second_image.read().unwrap()))
            .unwrap();
        assert_ne!(
            first_entry.read().unwrap().texture,
            second_entry.read().unwrap().texture
        );
        drop(context);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn does_nothing_for_empty_rich_text() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let source = create_test_rich_text("", 100.0, 40.0);
        let proxy = create_test_rich_text_proxy(&mut state, &source);
        let before = get_wgpu_render_state_runtime(&state).uniform_offset;
        draw_wgpu_rich_text(&mut state, &proxy);
        assert_eq!(record.created_count(), 0);
        assert_eq!(get_wgpu_render_state_runtime(&state).uniform_offset, before);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn does_nothing_when_render_pass_is_none() {
        let mut state = create_wgpu_render_state_for_test(None);
        let record = set_test_hosts(&mut state);
        let source = create_test_rich_text("text", 100.0, 40.0);
        let proxy = create_test_rich_text_proxy(&mut state, &source);
        draw_wgpu_rich_text(&mut state, &proxy);
        assert_eq!(record.created_count(), 0);
    }

    #[test]
    fn rasterizes_the_glyph_runs_background_and_border() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let source = create_test_rich_text("hello", 100.0, 40.0);
        {
            let mut source = source.write().unwrap();
            source.data.background = true;
            source.data.border = true;
        }
        let proxy = create_test_rich_text_proxy(&mut state, &source);

        draw_wgpu_rich_text(&mut state, &proxy);

        let context = record.last_context();
        assert_eq!(context.count("fillText(hello"), 1);
        assert_eq!(context.count("strokeRect("), 1);
        assert!(context.count("fillRect(0,0,") >= 1);
        submit_wgpu_frame(&mut state);
    }
}

mod draw_wgpu_rich_text_with_overlay {
    use super::*;

    #[test]
    fn rasterizes_the_given_overlay_onto_the_field_canvas() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let source = create_test_rich_text("x", 100.0, 40.0);
        let proxy = create_test_rich_text_proxy(&mut state, &source);
        draw_wgpu_rich_text_with_overlay(&mut state, &proxy, Some(stamp_test_overlay));
        assert_eq!(record.last_context().count(TEST_OVERLAY_STAMP), 1);
        submit_wgpu_frame(&mut state);
    }
}

mod register_wgpu_text_input_overlay {
    use super::*;

    #[test]
    fn invokes_the_registered_overlay_only_for_a_rich_text_with_an_input_slot() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        register_wgpu_text_input_overlay(&mut state, stamp_test_overlay);

        let plain = create_test_rich_text("x", 100.0, 40.0);
        let plain_proxy = create_test_rich_text_proxy(&mut state, &plain);
        draw_wgpu_rich_text(&mut state, &plain_proxy);
        assert_eq!(record.last_context().count(TEST_OVERLAY_STAMP), 0);

        let editable = create_test_rich_text("x", 100.0, 40.0);
        flight_textinput::enable_text_input(&editable, None);
        let editable_proxy = create_test_rich_text_proxy(&mut state, &editable);
        draw_wgpu_rich_text(&mut state, &editable_proxy);
        assert_eq!(record.last_context().count(TEST_OVERLAY_STAMP), 1);
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_rich_text_renderer {
    use super::*;

    #[test]
    fn has_create_data_destroy_data_and_submit_functions() {
        assert!(WGPU_RICH_TEXT_RENDERER.destroy_data.is_some());
        assert!(std::ptr::fn_addr_eq(
            WGPU_RICH_TEXT_RENDERER.submit,
            draw_wgpu_rich_text as fn(_, _)
        ));
    }
}
