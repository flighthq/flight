use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Ref, get_entity_id};
use flight_node::{NodeRef, RendererDataRef};
use flight_render::{BatchFormat, RenderProxy2D};
use flight_render_gl::GlRenderState;
use flight_scene2d_gl::contract::*;
use flight_text::contract::{TextLabel, create_text_label, set_text_label_string};
use flight_textformat::TextFormat;

use crate::gl_test_helper::{
    count_calls, create_gl_state, create_gl_state_with_hosts, create_test_image_host,
    make_canvas_surface, make_scene2d_proxy, surface_calls, test_default,
};

fn make_text_node(text: &str) -> Ref<TextLabel> {
    let source = create_text_label(None);
    {
        let mut label = source.write().unwrap();
        label.data.text = text.to_string();
        label.data.text_format = Arc::new(RwLock::new(test_default::<TextFormat>()));
        label.data.width = 200.0;
        label.data.height = 100.0;
    }
    return source;
}

fn make_text_proxy(
    state: &mut GlRenderState,
    source: &Ref<TextLabel>,
    renderer_data: Option<RendererDataRef>,
) -> RenderProxy2D<GlRenderState> {
    let node: NodeRef = source.clone();
    let mut proxy = make_scene2d_proxy(state, node);
    proxy.renderer_data = renderer_data;
    return proxy;
}

fn create_data(state: &mut GlRenderState) -> RendererDataRef {
    let node: NodeRef = create_text_label(None);
    return (GL_TEXT_LABEL_RENDERER.create_data)(state, &node).unwrap();
}

fn with_data<R>(data: &RendererDataRef, read: impl FnOnce(&GlTextLabelData) -> R) -> R {
    let guard = data.read().unwrap();
    return read(guard.as_any().downcast_ref::<GlTextLabelData>().unwrap());
}

fn quad_count(state: &GlRenderState) -> usize {
    return state.gl_runtime.borrow().quad_batch_writer_count;
}

mod draw_gl_text_label {
    use super::*;

    #[test]
    fn keeps_different_text_nodes_on_distinct_surfaces_and_gpu_textures_in_one_frame() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let first_data = create_data(&mut state);
        let second_data = create_data(&mut state);

        let first = make_text_proxy(
            &mut state,
            &make_text_node("first"),
            Some(first_data.clone()),
        );
        draw_gl_text_label(&mut state, &first);
        let second = make_text_proxy(
            &mut state,
            &make_text_node("second"),
            Some(second_data.clone()),
        );
        draw_gl_text_label(&mut state, &second);

        let (first_surface, first_image) = with_data(&first_data, |data| {
            (data.surface.clone().unwrap(), data.image.clone().unwrap())
        });
        let (second_surface, second_image) = with_data(&second_data, |data| {
            (data.surface.clone().unwrap(), data.image.clone().unwrap())
        });
        assert!(!Arc::ptr_eq(&first_surface, &second_surface));
        assert!(!Arc::ptr_eq(&first_image, &second_image));
        let context = state.context_state.runtime_state.borrow();
        let caches = &context.texture_caches.by_texture_entity;
        let first_texture = caches
            .get(&(get_entity_id(&*first_image.read().unwrap()), true, false))
            .unwrap()
            .texture;
        let second_texture = caches
            .get(&(get_entity_id(&*second_image.read().unwrap()), true, false))
            .unwrap()
            .texture;
        assert_ne!(first_texture, second_texture);
        drop(context);

        draw_gl_text_label(&mut state, &first);
        assert!(with_data(&first_data, |data| data.surface.is_some()
            && data.image.is_some()));
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_text_is_empty() {
        let mut state = create_gl_state();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node(""), Some(data));
        draw_gl_text_label(&mut state, &proxy);
        assert_eq!(quad_count(&state), 0);
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_renderer_data_is_null() {
        let mut state = create_gl_state();
        register_gl_standard_material(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("hello"), None);
        draw_gl_text_label(&mut state, &proxy);
        assert_eq!(quad_count(&state), 0);
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_no_material_renderer_is_registered() {
        let mut state = create_gl_state();
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("hello"), Some(data));
        draw_gl_text_label(&mut state, &proxy);
        assert_eq!(quad_count(&state), 0);
    }

    #[test]
    fn writes_one_instance_to_the_quad_batch_writer_when_text_has_content() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("hello"), Some(data));
        draw_gl_text_label(&mut state, &proxy);
        assert_eq!(quad_count(&state), 1);
    }

    #[test]
    fn rasterizes_packed_run_alpha_into_the_canvas_color() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let node = make_text_node("hello");
        let format = TextFormat {
            color: Some(0xff000080),
            ..test_default::<TextFormat>()
        };
        node.write().unwrap().data.text_format = Arc::new(RwLock::new(format));
        let proxy = make_text_proxy(&mut state, &node, Some(data.clone()));

        draw_gl_text_label(&mut state, &proxy);

        let surface = with_data(&data, |data| data.surface.clone().unwrap());
        let calls = surface_calls(&surface);
        let styles = calls
            .iter()
            .enumerate()
            .filter(|(_, call)| call.starts_with("fillText("))
            .map(|(index, _)| {
                calls[..index]
                    .iter()
                    .rev()
                    .find(|call| call.starts_with("fillStyle="))
                    .cloned()
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(
            styles,
            vec![format!(
                "fillStyle={}",
                flight_color::compute_rgba_css_string(0xff000080)
            )]
        );
    }

    #[test]
    fn draws_via_draw_elements_instanced_after_flush() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("hello"), Some(data));
        draw_gl_text_label(&mut state, &proxy);
        flush_gl_quad_batch_writer(&mut state);
        assert!(count_calls("draw_elements_instanced") > 0);
    }

    #[test]
    fn skips_layout_and_rasterization_on_repeated_calls_when_the_content_version_is_unchanged() {
        let (mut state, host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("hello"), Some(data.clone()));
        draw_gl_text_label(&mut state, &proxy);
        let created = host.created.lock().unwrap().len();
        let surface = with_data(&data, |data| data.surface.clone().unwrap());
        let raster_calls = surface_calls(&surface).len();

        draw_gl_text_label(&mut state, &proxy);

        assert_eq!(host.created.lock().unwrap().len(), created);
        assert_eq!(surface_calls(&surface).len(), raster_calls);
    }

    #[test]
    fn re_rasterizes_when_the_content_version_is_bumped() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let node = make_text_node("hello");
        let proxy = make_text_proxy(&mut state, &node, Some(data.clone()));
        draw_gl_text_label(&mut state, &proxy);
        let version = with_data(&data, |data| data.last_content_id);

        set_text_label_string(&node, "world");
        draw_gl_text_label(&mut state, &proxy);

        assert_ne!(with_data(&data, |data| data.last_content_id), version);
        let surface = with_data(&data, |data| data.surface.clone().unwrap());
        assert!(
            surface_calls(&surface)
                .iter()
                .any(|call| call.starts_with("fillText(world"))
        );
    }

    // TS `invalidateImageResource` re-measures through the registered host resolver (module-global
    // in TS; the state's `image_resolver` here, D5). With none, the image keeps its measured size.
    #[test]
    fn re_measures_the_rasterized_image_through_the_states_image_resolver() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
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
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("hello"), Some(data.clone()));

        draw_gl_text_label(&mut state, &proxy);

        let image = with_data(&data, |data| data.image.clone().unwrap());
        let image = image.read().unwrap();
        assert_eq!((image.width, image.height), (7, 9));
    }

    #[test]
    fn keeps_the_host_measured_image_size_without_an_image_resolver() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("hello"), Some(data.clone()));

        draw_gl_text_label(&mut state, &proxy);

        let image = with_data(&data, |data| data.image.clone().unwrap());
        let image = image.read().unwrap();
        assert_ne!((image.width, image.height), (7, 9));
        assert!(image.version > 0);
    }

    #[test]
    fn does_not_re_rasterize_when_only_alpha_changes_version_unchanged() {
        let (mut state, host) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let mut proxy = make_text_proxy(&mut state, &make_text_node("hello"), Some(data.clone()));
        draw_gl_text_label(&mut state, &proxy);
        let created = host.created.lock().unwrap().len();
        let surface = with_data(&data, |data| data.surface.clone().unwrap());
        let raster_calls = surface_calls(&surface).len();

        proxy.alpha = 0.5;
        draw_gl_text_label(&mut state, &proxy);

        assert_eq!(host.created.lock().unwrap().len(), created);
        assert_eq!(surface_calls(&surface).len(), raster_calls);
    }
}

mod gl_text_label_renderer {
    use super::*;

    #[test]
    fn declares_batch_format_quad() {
        assert_eq!(GL_TEXT_LABEL_RENDERER.format, Some(BatchFormat::Quad));
    }

    #[test]
    fn creates_renderer_data_with_an_entity_runtime_slot() {
        let mut state = create_gl_state();
        let data = create_data(&mut state);
        assert!(get_entity_id(&*data.read().unwrap()) > 0);
        assert!(with_data(&data, |data| data.surface.is_none()));
    }

    #[test]
    fn has_a_submit_function_pointing_to_draw_gl_text_label() {
        assert!(std::ptr::fn_addr_eq(
            GL_TEXT_LABEL_RENDERER.submit,
            draw_gl_text_label as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }

    #[test]
    fn removes_the_gpu_cache_entry_before_returning_the_node_surface_to_its_creator() {
        let mut state = create_gl_state();
        let order = Arc::new(Mutex::new(Vec::<String>::new()));
        let recorded = order.clone();
        state.canvas_host = Some(flight_surface::HostCanvasCapability {
            provider: Arc::new(()),
            acquire: Arc::new(|_, _| None),
            create: Arc::new(|_, _, _, _| None),
            create_surface: Arc::new(|width, height| Some(make_canvas_surface(width, height))),
            destroy_surface: Arc::new(move |_| {
                recorded.lock().unwrap().push(format!(
                    "surface after {} texture deletes",
                    count_calls("delete_textures")
                ));
            }),
            release: Arc::new(|_| {}),
        });
        state.image_host = Some(create_test_image_host());
        register_gl_standard_material(&mut state);
        let data = create_data(&mut state);
        let proxy = make_text_proxy(&mut state, &make_text_node("owned"), Some(data.clone()));
        draw_gl_text_label(&mut state, &proxy);
        order.lock().unwrap().clear();
        let image = with_data(&data, |data| data.image.clone().unwrap());
        let key = (get_entity_id(&*image.read().unwrap()), true, false);
        assert!(
            state
                .context_state
                .runtime_state
                .borrow()
                .texture_caches
                .by_texture_entity
                .contains_key(&key)
        );
        let deletes = count_calls("delete_textures");

        (GL_TEXT_LABEL_RENDERER.destroy_data.unwrap())(&mut state, data);

        assert!(
            !state
                .context_state
                .runtime_state
                .borrow()
                .texture_caches
                .by_texture_entity
                .contains_key(&key)
        );
        assert_eq!(
            *order.lock().unwrap(),
            vec![format!("surface after {} texture deletes", deletes + 1)]
        );
    }
}

mod initialize_gl_text_label_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_gl_text_label_data() {
        let mut data: GlTextLabelData = flight_entity::allocate_entity();
        data.last_content_id = 5;
        data.log_w = 3.0;
        initialize_gl_text_label_data(&mut data);
        assert_eq!(data.last_content_id, -1);
        assert_eq!(data.log_w, 0.0);
        assert!(data.surface.is_none());
        assert!(data.image.is_none());
    }
}
