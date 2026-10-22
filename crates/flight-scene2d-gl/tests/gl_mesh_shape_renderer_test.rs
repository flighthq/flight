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
    GradientType, Shape, append_shape_begin_fill, append_shape_begin_gradient_fill,
    append_shape_end_fill, append_shape_rectangle, create_shape, register_default_shape_bounds_commands,
};

use crate::gl_test_helper::{count_calls, create_gl_state, make_scene2d_proxy};

fn solid_shape() -> Ref<Shape> {
    let shape = create_shape();
    append_shape_begin_fill(&shape, 0x00cc00ff, None);
    append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
    append_shape_end_fill(&shape);
    return shape;
}

fn gradient_shape() -> Ref<Shape> {
    let shape = create_shape();
    append_shape_begin_gradient_fill(
        &shape,
        GradientType::Linear,
        &[0xff0000ff, 0x0000ffff],
        &[1.0, 1.0],
        &[0.0, 255.0],
        None,
        None,
        None,
        None,
    );
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

mod draw_gl_mesh_shape {
    use super::*;

    #[test]
    fn draws_a_solid_fill_as_a_gpu_mesh_and_reports_that_it_drew() {
        let mut state = create_gl_state();
        let proxy = make_shape_node(&mut state, solid_shape(), true);
        assert!(draw_gl_mesh_shape(&mut state, &proxy));
        assert!(count_calls("draw_elements") > 0);
    }

    #[test]
    fn reports_false_for_a_fill_with_no_tessellated_form_which_is_the_hybrid_fall_through_signal() {
        let mut state = create_gl_state();
        let proxy = make_shape_node(&mut state, gradient_shape(), true);
        assert!(!draw_gl_mesh_shape(&mut state, &proxy));
    }

    #[test]
    fn reports_false_for_an_empty_command_list_and_for_absent_renderer_data() {
        let mut state = create_gl_state();
        let empty = make_shape_node(&mut state, create_shape(), true);
        assert!(!draw_gl_mesh_shape(&mut state, &empty));
        let no_data = make_shape_node(&mut state, solid_shape(), false);
        assert!(!draw_gl_mesh_shape(&mut state, &no_data));
    }
}

mod gl_mesh_shape_renderer {
    use super::*;

    #[test]
    fn declares_batch_format_quad_and_the_shared_shape_data_lifecycle() {
        assert_eq!(GL_MESH_SHAPE_RENDERER.format, Some(BatchFormat::Quad));
        assert!(GL_MESH_SHAPE_RENDERER.destroy_data.is_some());
    }

    #[test]
    fn never_rasterizes_even_with_a_rasterizer_registered_and_a_fill_that_cannot_tessellate() {
        let mut state = create_gl_state();
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        register_gl_shape_rasterizer(
            &mut state,
            Some(Arc::new(move |_, _, _| *counter.lock().unwrap() += 1)),
        );
        let proxy = make_shape_node(&mut state, gradient_shape(), true);
        (GL_MESH_SHAPE_RENDERER.submit)(&mut state, &proxy);
        assert_eq!(*calls.lock().unwrap(), 0);
    }

    #[test]
    fn reports_a_shape_rasterizer_miss_rather_than_silently_dropping_an_untessellatable_fill() {
        let mut state = create_gl_state();
        enable_render_registries_guards(&mut state, None);
        let proxy = make_shape_node(&mut state, gradient_shape(), true);
        (GL_MESH_SHAPE_RENDERER.submit)(&mut state, &proxy);
        assert!(
            explain_render_registries_misses(&state)
                .misses
                .iter()
                .any(|miss| miss.kind == "Shape"
                    && miss.registry == RenderRegistryTable::ShapeRasterizer)
        );
    }
}
