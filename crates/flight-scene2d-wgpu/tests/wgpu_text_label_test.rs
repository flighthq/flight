use std::sync::{Arc, RwLock};

use flight_color::compute_rgba_css_string;
use flight_entity::get_entity_id;
use flight_node::{NodeRef, RendererDataRef};
use flight_render::{BatchFormat, RenderProxy2D};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;
use flight_textformat::TextFormat;

use crate::support::*;

fn text_proxy(
    state: &mut WgpuRenderState,
    text: &str,
    color: Option<u32>,
) -> RenderProxy2D<WgpuRenderState> {
    let label = flight_text::create_text_label(None);
    {
        let mut label = label.write().unwrap();
        label.data.text = text.to_string();
        let mut format: TextFormat = test_default();
        format.color = color;
        label.data.text_format = Arc::new(RwLock::new(format));
        label.data.width = 200.0;
        label.data.height = 100.0;
    }
    let node: NodeRef = label;
    let mut proxy = create_test_proxy_for(state, &node);
    proxy.renderer_data = (WGPU_TEXT_LABEL_RENDERER.create_data)(state, &node);
    return proxy;
}

fn label_data<T>(data: &RendererDataRef, read: impl FnOnce(&WgpuTextLabelData) -> T) -> T {
    let guard = data.read().unwrap();
    return read(get_wgpu_renderer_data::<WgpuTextLabelData>(Some(&*guard)).unwrap());
}

fn writer_count(state: &WgpuRenderState) -> u32 {
    return get_wgpu_render_state_runtime(state).quad_batch_writer_count;
}

mod draw_wgpu_text_label {
    use super::*;

    #[test]
    fn keeps_different_text_nodes_on_distinct_surfaces_and_gpu_textures_in_one_frame() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let first = text_proxy(&mut state, "first", None);
        let second = text_proxy(&mut state, "second", None);

        draw_wgpu_text_label(&mut state, &first);
        draw_wgpu_text_label(&mut state, &second);

        let first_data = first.renderer_data.clone().unwrap();
        let second_data = second.renderer_data.clone().unwrap();
        let (first_surface, first_image) = label_data(&first_data, |data| {
            (data.surface.clone().unwrap(), data.image.clone().unwrap())
        });
        let (second_surface, second_image) = label_data(&second_data, |data| {
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
    fn returns_early_when_text_is_empty() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        let proxy = text_proxy(&mut state, "", None);
        draw_wgpu_text_label(&mut state, &proxy);
        assert_eq!(writer_count(&state), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn writes_one_instance_to_the_quad_batch_writer_when_text_has_content() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let proxy = text_proxy(&mut state, "hello", None);
        draw_wgpu_text_label(&mut state, &proxy);
        assert_eq!(writer_count(&state), 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn rasterizes_packed_run_alpha_into_the_canvas_color() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let proxy = text_proxy(&mut state, "hello", Some(0xff000080));

        draw_wgpu_text_label(&mut state, &proxy);

        let calls = record.last_context().calls();
        let fill_text = calls
            .iter()
            .position(|call| call.starts_with("fillText("))
            .unwrap();
        let style = calls[..fill_text]
            .iter()
            .rev()
            .find(|call| call.starts_with("fillStyle="))
            .unwrap();
        assert_eq!(
            style,
            &format!("fillStyle={}", compute_rgba_css_string(0xff000080))
        );
        assert_eq!(record.last_context().count("fillText("), 1);
        submit_wgpu_frame(&mut state);
    }

    // TS `invalidateImageResource` re-measures through the registered host resolver (module-global
    // in TS; the state's `image_resolver` here, D5). With none, the image keeps its measured size.
    #[test]
    fn re_measures_the_rasterized_image_through_the_states_image_resolver() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let mut resolver = flight_image::contract::create_image_resolver_state();
        flight_image::contract::register_host_image_dimension_resolver(
            &mut resolver,
            Arc::new(|_source, out| {
                out.width = 7;
                out.height = 9;
                return true;
            }),
        );
        state.image_resolver = Some(Arc::new(RwLock::new(resolver)));
        let proxy = text_proxy(&mut state, "hello", None);

        draw_wgpu_text_label(&mut state, &proxy);

        let data = proxy.renderer_data.clone().unwrap();
        let image = label_data(&data, |data| data.image.clone().unwrap());
        let image = image.read().unwrap();
        assert_eq!((image.width, image.height), (7, 9));
        drop(image);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn keeps_the_host_measured_image_size_without_an_image_resolver() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let proxy = text_proxy(&mut state, "hello", None);

        draw_wgpu_text_label(&mut state, &proxy);

        let data = proxy.renderer_data.clone().unwrap();
        let image = label_data(&data, |data| data.image.clone().unwrap());
        let image = image.read().unwrap();
        assert_ne!((image.width, image.height), (7, 9));
        assert!(image.version > 0);
        drop(image);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn does_not_re_rasterize_when_only_alpha_changes() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let mut proxy = text_proxy(&mut state, "hello", None);
        draw_wgpu_text_label(&mut state, &proxy);
        let data = proxy.renderer_data.clone().unwrap();
        let version = label_data(&data, |data| data.last_content_id);
        let fills = record.last_context().count("fillText(");

        proxy.alpha = 0.5;
        draw_wgpu_text_label(&mut state, &proxy);

        // The content version is unchanged, so the rasterization block is skipped entirely.
        assert_eq!(label_data(&data, |data| data.last_content_id), version);
        assert_eq!(record.last_context().count("fillText("), fills);
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_text_label_renderer {
    use super::*;

    #[test]
    fn declares_batch_format_quad() {
        assert_eq!(WGPU_TEXT_LABEL_RENDERER.format, Some(BatchFormat::Quad));
    }

    #[test]
    fn has_create_data_destroy_data_and_submit_functions() {
        assert!(WGPU_TEXT_LABEL_RENDERER.destroy_data.is_some());
        assert!(std::ptr::fn_addr_eq(
            WGPU_TEXT_LABEL_RENDERER.submit,
            draw_wgpu_text_label as fn(_, _)
        ));
    }

    #[test]
    fn removes_the_gpu_cache_entry_before_returning_the_node_surface_to_its_creator() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        register_wgpu_standard_material(&mut state);
        let mut proxy = text_proxy(&mut state, "owned", None);
        draw_wgpu_text_label(&mut state, &proxy);
        let data = proxy.renderer_data.take().unwrap();
        let image = label_data(&data, |data| data.image.clone().unwrap());
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

        (WGPU_TEXT_LABEL_RENDERER.destroy_data.unwrap())(&mut state, data);

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
}
