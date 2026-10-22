use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_node::{NodeRef, get_node_local_bounds_rectangle};
use flight_path::{Path, PathMesh, PathWinding, StrokeStyle, tessellate_stroke_path};
use flight_render::{BatchFormat, RenderProxy2D};
use flight_render_gl::GlRenderState;
use flight_scene2d_gl::contract::*;
use flight_shape::contract::{
    GradientType, Shape, append_shape_begin_fill, append_shape_begin_gradient_fill,
    append_shape_end_fill, append_shape_line_style, append_shape_line_to, append_shape_move_to,
    append_shape_path, append_shape_rectangle, create_shape,
    register_default_shape_bounds_commands,
};

use crate::gl_test_helper::{
    count_calls, create_gl_state_with_hosts, make_scene2d_proxy, surface_calls,
};

fn noop_rasterizer() -> flight_render::ShapeRasterizer<GlRenderState> {
    return Arc::new(|_, _, _| {});
}

// The TS `enableGlStrokePathTessellation` kernel, installed directly on the registry.
fn stroke_path_tessellator(
    path: &Path,
    style: &StrokeStyle,
    tolerance: Option<f32>,
) -> Option<PathMesh> {
    return tessellate_stroke_path(path, style, tolerance.map(f64::from));
}

fn line_style(shape: &Ref<Shape>, thickness: f64, color: u32) {
    append_shape_line_style(
        shape,
        Some(thickness),
        color,
        None,
        None,
        None,
        None,
        None,
        None,
    );
}

fn closed_stroke_shape() -> Ref<Shape> {
    let shape = create_shape();
    line_style(&shape, 8.0, 0xff0000ff);
    append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
    return shape;
}

// A gradient fill has no tessellated form, so it always takes the raster lane (TS `commands: [{}]`
// with the 64x48 stubbed bounds).
fn raster_shape() -> Ref<Shape> {
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
    append_shape_rectangle(&shape, 0.0, 0.0, 64.0, 48.0);
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

fn batch_count(state: &GlRenderState) -> usize {
    return state.gl_runtime.borrow().quad_batch_writer_count;
}

mod draw_gl_shape {
    use super::*;

    #[test]
    fn draws_a_solid_fill_and_open_solid_stroke_as_gpu_meshes_in_one_shape() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        let shape = create_shape();
        append_shape_begin_fill(&shape, 0x00cc00ff, None);
        line_style(&shape, 0.0, 0x000000ff);
        append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
        append_shape_end_fill(&shape);
        line_style(&shape, 4.0, 0xff0000ff);
        append_shape_move_to(&shape, 8.0, 4.0);
        append_shape_line_to(&shape, 40.0, 4.0);
        let proxy = make_shape_node(&mut state, shape, true);

        draw_gl_shape(&mut state, &proxy);

        assert_eq!(count_calls("draw_elements"), 2);
        assert_eq!(batch_count(&state), 0);
    }

    #[test]
    fn draws_a_closed_solid_stroke_ring_as_one_gpu_mesh() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        state.registries.stroke_tessellator = Some(stroke_path_tessellator);
        let proxy = make_shape_node(&mut state, closed_stroke_shape(), true);

        draw_gl_shape(&mut state, &proxy);

        assert_eq!(count_calls("draw_elements"), 1);
        assert_eq!(batch_count(&state), 0);
    }

    #[test]
    fn keeps_a_closed_stroke_on_the_raster_lane_until_stroke_path_tessellation_is_enabled() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        register_gl_standard_material(&mut state);
        let proxy = make_shape_node(&mut state, closed_stroke_shape(), true);

        draw_gl_shape(&mut state, &proxy);

        assert_eq!(count_calls("draw_elements"), 0);
        assert_eq!(batch_count(&state), 1);
    }

    #[test]
    fn rasterizes_at_the_state_pixel_ratio_so_the_fallback_is_not_soft_on_a_dense_display() {
        let (mut state, hosts) = create_gl_state_with_hosts();
        state.render.pixel_ratio = 3.0;
        register_gl_standard_material(&mut state);
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        register_gl_shape_rasterizer(
            &mut state,
            Some(Arc::new(move |_, _, _| *counter.lock().unwrap() += 1)),
        );
        let shape = closed_stroke_shape();
        let node: NodeRef = shape.clone();
        let proxy = make_shape_node(&mut state, shape, true);
        let bounds = get_node_local_bounds_rectangle(&node);

        draw_gl_shape(&mut state, &proxy);

        assert_eq!(*calls.lock().unwrap(), 1);
        let expected = (
            (bounds.width.ceil() * 3.0).ceil(),
            (bounds.height.ceil() * 3.0).ceil(),
        );
        assert_eq!(
            hosts.created.lock().unwrap().last().copied(),
            Some(expected)
        );
        let surface = {
            let mut guard = proxy.renderer_data.as_ref().unwrap().write().unwrap();
            get_gl_shape_data(&mut *guard)
                .unwrap()
                .surface
                .clone()
                .unwrap()
        };
        assert!(
            surface_calls(&surface)
                .iter()
                .any(|call| call.starts_with("setTransform(3,0,0,3,"))
        );
    }

    #[test]
    fn re_rasterizes_when_only_the_pixel_ratio_changes_since_the_cached_raster_is_the_wrong_density()
     {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_standard_material(&mut state);
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        register_gl_shape_rasterizer(
            &mut state,
            Some(Arc::new(move |_, _, _| *counter.lock().unwrap() += 1)),
        );
        let proxy = make_shape_node(&mut state, closed_stroke_shape(), true);

        draw_gl_shape(&mut state, &proxy);
        draw_gl_shape(&mut state, &proxy);
        assert_eq!(*calls.lock().unwrap(), 1);

        state.render.pixel_ratio = 2.0;
        draw_gl_shape(&mut state, &proxy);

        assert_eq!(*calls.lock().unwrap(), 2);
    }

    #[test]
    fn falls_back_to_the_raster_quad_for_a_self_intersecting_stroke_centerline() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        state.registries.stroke_tessellator = Some(stroke_path_tessellator);
        register_gl_standard_material(&mut state);
        let shape = create_shape();
        line_style(&shape, 8.0, 0xff0000ff);
        append_shape_path(
            &shape,
            &[1, 2, 2, 2, 7],
            &[8.0, 8.0, 40.0, 40.0, 8.0, 40.0, 40.0, 8.0],
            Some(PathWinding::NonZero),
        );
        let proxy = make_shape_node(&mut state, shape, true);

        draw_gl_shape(&mut state, &proxy);
        draw_gl_shape(&mut state, &proxy);

        assert_eq!(count_calls("draw_elements"), 0);
        assert_eq!(batch_count(&state), 2);
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_commands_array_is_empty() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        register_gl_standard_material(&mut state);
        let proxy = make_shape_node(&mut state, create_shape(), true);
        draw_gl_shape(&mut state, &proxy);
        assert_eq!(batch_count(&state), 0);
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_renderer_data_is_null() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        register_gl_standard_material(&mut state);
        let proxy = make_shape_node(&mut state, raster_shape(), false);
        draw_gl_shape(&mut state, &proxy);
        assert_eq!(batch_count(&state), 0);
    }

    #[test]
    fn returns_early_without_writing_to_batch_when_no_material_renderer_is_registered() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        let proxy = make_shape_node(&mut state, raster_shape(), true);
        draw_gl_shape(&mut state, &proxy);
        assert_eq!(batch_count(&state), 0);
    }

    #[test]
    fn writes_one_instance_to_the_quad_batch_writer_when_shape_has_valid_commands_and_bounds() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        register_gl_standard_material(&mut state);
        let proxy = make_shape_node(&mut state, raster_shape(), true);
        draw_gl_shape(&mut state, &proxy);
        assert_eq!(batch_count(&state), 1);
    }

    #[test]
    fn draws_via_draw_elements_instanced_after_flush() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        register_gl_standard_material(&mut state);
        let proxy = make_shape_node(&mut state, raster_shape(), true);
        draw_gl_shape(&mut state, &proxy);
        flush_gl_quad_batch_writer(&mut state);
        assert_eq!(count_calls("draw_elements_instanced"), 1);
    }

    #[test]
    fn writes_correct_size_into_instance_data() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        register_gl_shape_rasterizer(&mut state, Some(noop_rasterizer()));
        register_gl_standard_material(&mut state);
        let proxy = make_shape_node(&mut state, raster_shape(), true);
        draw_gl_shape(&mut state, &proxy);
        let runtime = state.gl_runtime.borrow();
        let data = &runtime.quad_batch_writer_instance_data;
        assert_eq!(data[0], 64.0);
        assert_eq!(data[3], 48.0);
    }
}

mod gl_shape_renderer {
    use super::*;

    #[test]
    fn provides_the_morph_shape_renderer_alias() {
        assert!(std::ptr::eq(GL_MORPH_SHAPE_RENDERER, &GL_SHAPE_RENDERER));
    }

    #[test]
    fn declares_batch_format_quad() {
        assert_eq!(GL_SHAPE_RENDERER.format, Some(BatchFormat::Quad));
    }

    #[test]
    fn has_a_create_data_function() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        let node: NodeRef = create_shape();
        assert!((GL_SHAPE_RENDERER.create_data)(&mut state, &node).is_some());
    }

    #[test]
    fn has_a_submit_function_pointing_to_draw_gl_shape() {
        assert!(std::ptr::fn_addr_eq(
            GL_SHAPE_RENDERER.submit,
            draw_gl_shape as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }
}
