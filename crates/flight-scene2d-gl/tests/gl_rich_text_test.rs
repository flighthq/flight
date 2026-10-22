use std::cell::Cell;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Ref, get_entity_id};
use flight_host::CanvasRenderingContext2D;
use flight_node::{NodeRef, RendererDataRef};
use flight_render::RenderProxy2D;
use flight_render_gl::GlRenderState;
use flight_scene2d_gl::contract::*;
use flight_text::contract::{RichText, create_rich_text};
use flight_textformat::{TextFormat, create_text_format_range};
use flight_textinput::enable_text_input;
use flight_textlayout::contract::TextLayoutResult;

use crate::gl_test_helper::{
    count_calls, create_gl_state, create_gl_state_with_hosts, create_test_image_host,
    make_canvas_surface, make_scene2d_proxy, test_default,
};

thread_local! {
    static OVERLAY_CALLS: Cell<usize> = const { Cell::new(0) };
}

fn record_overlay(
    _context: &CanvasRenderingContext2D,
    _source: &Ref<RichText>,
    _result: &TextLayoutResult,
    _field_w: f32,
    _field_h: f32,
    _text: &str,
) {
    OVERLAY_CALLS.with(|calls| calls.set(calls.get() + 1));
}

fn overlay_calls() -> usize {
    return OVERLAY_CALLS.with(|calls| calls.get());
}

fn make_rich_text_node(text: &str) -> Ref<RichText> {
    let node = create_rich_text(None);
    node.write().unwrap().data.text = text.to_string();
    return node;
}

fn make_proxy(
    state: &mut GlRenderState,
    source: &Ref<RichText>,
    renderer_data: Option<RendererDataRef>,
) -> RenderProxy2D<GlRenderState> {
    let node: NodeRef = source.clone();
    let mut proxy = make_scene2d_proxy(state, node);
    proxy.renderer_data = renderer_data;
    return proxy;
}

fn create_data(state: &mut GlRenderState) -> RendererDataRef {
    let node: NodeRef = create_rich_text(None);
    return create_gl_rich_text_data(state, &node).unwrap();
}

fn with_data<R>(data: &RendererDataRef, read: impl FnOnce(&GlRichTextData) -> R) -> R {
    let guard = data.read().unwrap();
    return read(guard.as_any().downcast_ref::<GlRichTextData>().unwrap());
}

fn draw(state: &mut GlRenderState, source: &Ref<RichText>) -> RendererDataRef {
    let data = create_data(state);
    let proxy = make_proxy(state, source, Some(data.clone()));
    draw_gl_rich_text(state, &proxy);
    return data;
}

mod create_gl_rich_text_data {
    use super::*;

    #[test]
    fn starts_without_a_raster_surface_until_the_node_first_draws() {
        let mut state = create_gl_state();
        let data = create_data(&mut state);
        assert!(with_data(&data, |data| data.surface.is_none()));
    }
}

mod destroy_gl_rich_text_data {
    use super::*;

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
        let data = draw(&mut state, &make_rich_text_node("owned"));
        order.lock().unwrap().clear();
        let image = with_data(&data, |data| data.image.clone().unwrap());
        let key = (get_entity_id(&*image.read().unwrap()), true, false);
        let deletes = count_calls("delete_textures");

        destroy_gl_rich_text_data(&mut state, data);

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

    #[test]
    fn is_a_no_op_when_no_surface_was_allocated() {
        let mut state = create_gl_state();
        let data = create_data(&mut state);
        destroy_gl_rich_text_data(&mut state, data);
        assert_eq!(count_calls("delete_textures"), 0);
    }
}

mod draw_gl_rich_text {
    use super::*;

    #[test]
    fn keeps_different_text_nodes_on_distinct_surfaces_and_gpu_textures_in_one_frame() {
        let (mut state, _host) = create_gl_state_with_hosts();
        let first_data = create_data(&mut state);
        let second_data = create_data(&mut state);
        let first = make_proxy(
            &mut state,
            &make_rich_text_node("first"),
            Some(first_data.clone()),
        );
        let second = make_proxy(
            &mut state,
            &make_rich_text_node("second"),
            Some(second_data.clone()),
        );

        draw_gl_rich_text(&mut state, &first);
        draw_gl_rich_text(&mut state, &second);

        let (first_surface, first_image) = with_data(&first_data, |data| {
            (data.surface.clone().unwrap(), data.image.clone().unwrap())
        });
        let (second_surface, second_image) = with_data(&second_data, |data| {
            (data.surface.clone().unwrap(), data.image.clone().unwrap())
        });
        assert!(!Arc::ptr_eq(&first_surface, &second_surface));
        assert!(!Arc::ptr_eq(&first_image, &second_image));
        {
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
        }

        draw_gl_rich_text(&mut state, &first);
        assert!(with_data(&first_data, |data| data.surface.is_some()
            && data.image.is_some()));
    }

    #[test]
    fn binds_the_active_bitmap_shader_when_drawing_rich_text() {
        let (mut state, _host) = create_gl_state_with_hosts();
        let node = make_rich_text_node("hello");
        let data = create_data(&mut state);
        let proxy = make_proxy(&mut state, &node, Some(data));

        draw_gl_rich_text(&mut state, &proxy);
        let shader = state.gl_runtime.borrow().default_bitmap_shader.clone();
        assert!(shader.is_some());

        draw_gl_rich_text(&mut state, &proxy);

        let bound = state
            .context_state
            .runtime_state
            .borrow()
            .binding
            .as_ref()
            .map(|binding| binding.program);
        assert_eq!(bound, Some(shader.unwrap().program));
    }

    #[test]
    fn returns_early_without_drawing_when_text_and_chrome_are_empty() {
        let mut state = create_gl_state();
        draw(&mut state, &make_rich_text_node(""));
        assert_eq!(count_calls("draw_elements"), 0);
    }

    #[test]
    fn draws_when_text_is_non_empty() {
        let (mut state, _host) = create_gl_state_with_hosts();
        draw(&mut state, &make_rich_text_node("hello"));
        assert!(count_calls("draw_elements") > 0);
    }

    #[test]
    fn draws_resolved_multi_format_spans() {
        let (mut state, _host) = create_gl_state_with_hosts();
        let node = make_rich_text_node("BoldGreen");
        let bold = TextFormat {
            bold: Some(true),
            ..test_default::<TextFormat>()
        };
        let green = TextFormat {
            color: Some(0x00ff00ff),
            ..test_default::<TextFormat>()
        };
        node.write().unwrap().data.text_format_ranges = vec![
            create_text_format_range(Arc::new(RwLock::new(bold)), 0, 4),
            create_text_format_range(Arc::new(RwLock::new(green)), 4, 9),
        ];
        draw(&mut state, &node);
        assert!(count_calls("draw_elements") > 0);
    }

    #[test]
    fn draws_field_chrome_even_when_text_is_empty() {
        let (mut state, _host) = create_gl_state_with_hosts();
        let node = make_rich_text_node("");
        node.write().unwrap().data.background = true;
        draw(&mut state, &node);
        assert!(count_calls("draw_elements") > 0);
    }
}

mod draw_gl_rich_text_with_overlay {
    use super::*;

    #[test]
    fn runs_an_optional_canvas_overlay_after_layout() {
        let (mut state, _host) = create_gl_state_with_hosts();
        let node = make_rich_text_node("hello");
        let data = create_data(&mut state);
        let proxy = make_proxy(&mut state, &node, Some(data));
        let before = overlay_calls();

        draw_gl_rich_text_with_overlay(&mut state, &proxy, Some(record_overlay));

        assert_eq!(overlay_calls(), before + 1);
    }
}

mod gl_rich_text_renderer {
    use super::*;

    #[test]
    fn has_a_create_data_function() {
        let mut state = create_gl_state();
        let node: NodeRef = create_rich_text(None);
        assert!((GL_RICH_TEXT_RENDERER.create_data)(&mut state, &node).is_some());
    }

    #[test]
    fn has_a_submit_function_pointing_to_draw_gl_rich_text() {
        assert!(std::ptr::fn_addr_eq(
            GL_RICH_TEXT_RENDERER.submit,
            draw_gl_rich_text as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }
}

mod initialize_gl_rich_text_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_gl_rich_text_data() {
        let state = create_gl_state();
        let mut data: GlRichTextData = flight_entity::allocate_entity();
        data.alloc_w = 4.0;
        let node: NodeRef = create_rich_text(None);
        initialize_gl_rich_text_data(&mut data, &state, &node);
        assert_eq!(data.alloc_w, 0.0);
        assert!(data.surface.is_none());
        assert!(data.image.is_none());
    }
}

mod register_gl_text_input_overlay {
    use super::*;

    #[test]
    fn invokes_the_registered_overlay_only_for_a_rich_text_with_an_input_slot() {
        let (mut state, _host) = create_gl_state_with_hosts();
        register_gl_text_input_overlay(&state, record_overlay);
        let before = overlay_calls();

        draw(&mut state, &make_rich_text_node("x"));
        assert_eq!(overlay_calls(), before);

        let editable = make_rich_text_node("x");
        enable_text_input(&editable, None);
        draw(&mut state, &editable);
        assert_eq!(overlay_calls(), before + 1);
    }
}
