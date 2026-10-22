use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_node::NodeRef;
use flight_render::{
    BatchFormat, RenderProxy2D, RenderRegistryTable, enable_render_registries_guards,
    explain_render_registries_misses,
};
use flight_render_gl::GlRenderState;
use flight_scene2d_gl::*;
use flight_shape::contract::{
    Shape, ShapeCommandToken, append_shape_begin_fill, append_shape_end_fill,
    append_shape_rectangle, create_shape, register_default_shape_bounds_commands,
};

use crate::gl_test_helper::{count_calls, create_gl_state, create_gl_state_with_hosts, make_scene2d_proxy};

// A plain solid rectangle — precisely the shape the mesh strategy would tessellate.
fn solid_shape() -> Ref<Shape> {
    let shape = create_shape();
    append_shape_begin_fill(&shape, 0x00cc00ff, None);
    append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
    append_shape_end_fill(&shape);
    return shape;
}

fn make_shape_node(
    state: &mut GlRenderState,
    shape: Ref<Shape>,
    with_data: bool,
) -> RenderProxy2D<GlRenderState> {
    // The shape's own bounds registry measures its commands (TS stubs the bounds query instead).
    let bounds_state = shape.read().unwrap().data.bounds_state.clone();
    register_default_shape_bounds_commands(&bounds_state);
    let node: NodeRef = shape;
    let mut proxy = make_scene2d_proxy(state, node.clone());
    proxy.renderer_data = if with_data {
        create_gl_shape_data(state, &node)
    } else {
        None
    };
    return proxy;
}

fn counting_rasterizer(state: &mut GlRenderState) -> Arc<Mutex<usize>> {
    let calls = Arc::new(Mutex::new(0));
    let counter = calls.clone();
    register_gl_shape_rasterizer(
        state,
        Some(Arc::new(move |_, _, _| *counter.lock().unwrap() += 1)),
    );
    return calls;
}

mod draw_gl_raster_shape {
    use super::*;

    #[test]
    fn rasterizes_a_fill_the_mesh_path_could_have_tessellated_which_is_what_pinning_this_strategy_means()
    {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let calls = counting_rasterizer(&mut state);
        let proxy = make_shape_node(&mut state, solid_shape(), true);

        draw_gl_raster_shape(&mut state, &proxy);

        assert_eq!(*calls.lock().unwrap(), 1);
        assert_eq!(count_calls("draw_elements"), 0);
    }

    #[test]
    fn replays_the_whole_command_stream_not_the_subset_a_mesh_path_could_not_express() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let shape = solid_shape();
        let replayed: Arc<Mutex<Vec<ShapeCommandToken>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = replayed.clone();
        register_gl_shape_rasterizer(
            &mut state,
            Some(Arc::new(move |_, commands, _| {
                *sink.lock().unwrap() = commands.to_vec();
            })),
        );
        let expected = shape.read().unwrap().data.commands.clone();
        let proxy = make_shape_node(&mut state, shape, true);

        draw_gl_raster_shape(&mut state, &proxy);

        assert_eq!(format!("{:?}", *replayed.lock().unwrap()), format!("{expected:?}"));
        assert!(!expected.is_empty());
    }

    #[test]
    fn reports_a_shape_rasterizer_miss_when_no_rasterizer_is_registered() {
        let mut state = create_gl_state();
        enable_render_registries_guards(&mut state, None);
        let proxy = make_shape_node(&mut state, solid_shape(), true);
        draw_gl_raster_shape(&mut state, &proxy);
        assert!(
            explain_render_registries_misses(&state)
                .misses
                .iter()
                .any(|miss| miss.kind == "Shape"
                    && miss.registry == RenderRegistryTable::ShapeRasterizer)
        );
    }

    #[test]
    fn preserves_expected_surface_absence_without_rasterizing_or_writing_a_batch() {
        let mut state = create_gl_state();
        register_gl_standard_material(&mut state);
        let calls = counting_rasterizer(&mut state);
        let proxy = make_shape_node(&mut state, solid_shape(), true);

        draw_gl_raster_shape(&mut state, &proxy);

        assert_eq!(*calls.lock().unwrap(), 0);
        assert_eq!(state.gl_runtime.borrow().quad_batch_writer_count, 0);
    }

    #[test]
    fn does_nothing_for_an_empty_command_list_or_absent_renderer_data() {
        let mut state = create_gl_state();
        let calls = counting_rasterizer(&mut state);
        let empty = make_shape_node(&mut state, create_shape(), true);
        draw_gl_raster_shape(&mut state, &empty);
        let no_data = make_shape_node(&mut state, solid_shape(), false);
        draw_gl_raster_shape(&mut state, &no_data);
        assert_eq!(*calls.lock().unwrap(), 0);
    }
}

mod gl_raster_shape_renderer {
    use super::*;

    #[test]
    fn declares_batch_format_quad_and_the_shared_shape_data_lifecycle() {
        assert_eq!(GL_RASTER_SHAPE_RENDERER.format, Some(BatchFormat::Quad));
        assert!(GL_RASTER_SHAPE_RENDERER.destroy_data.is_some());
        assert!(std::ptr::fn_addr_eq(
            GL_RASTER_SHAPE_RENDERER.submit,
            draw_gl_raster_shape as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }
}
