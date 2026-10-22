use std::cell::RefCell;

use flight_render::RenderProxy2D;
use flight_render_gl::GlRenderState;
use flight_scene2d_gl::contract::*;

use crate::gl_test_helper::{
    calls_with, count_calls, create_gl_state, make_color_scale_bias, make_ct, make_scene2d_proxy,
};

fn make_proxy(state: &mut GlRenderState) -> RenderProxy2D<GlRenderState> {
    return make_scene2d_proxy(state, crate::gl_test_helper::display_node());
}

fn triangle() -> GlShapeMesh {
    return GlShapeMesh {
        vertices: vec![0.0, 0.0, 10.0, 0.0, 0.0, 10.0],
        indices: vec![0, 1, 2],
        color: 0xff8040ff,
        alpha: 1.0,
    };
}

fn has_uniform_4(location: Option<&glow::NativeUniformLocation>, values: [f32; 4]) -> bool {
    let location = location.map_or(-1, |value| value.0 as i64);
    return calls_with("uniform_4_f32")
        .iter()
        .any(|call| call.integers == vec![location] && call.floats == values.to_vec());
}

mod draw_gl_shape_mesh_batch {
    use super::*;

    #[test]
    fn runs_on_program_bound_after_the_matrix_upload_and_before_the_draw_loop() {
        let mut state = create_gl_state();
        let proxy = make_proxy(&mut state);
        let binding = ensure_gl_shape_mesh_program(&state);
        let observed = RefCell::new(None);
        let bound = |_: &GlRenderState| {
            *observed.borrow_mut() = Some((
                count_calls("uniform_matrix_3_f32"),
                count_calls("draw_elements"),
            ));
        };

        draw_gl_shape_mesh_batch(&mut state, &proxy, &[triangle()], &binding, Some(&bound));

        assert_eq!(*observed.borrow(), Some((1, 0)));
        assert_eq!(count_calls("draw_elements"), 1);
    }

    #[test]
    fn is_a_no_op_for_an_empty_mesh_list() {
        let mut state = create_gl_state();
        let proxy = make_proxy(&mut state);
        let binding = ensure_gl_shape_mesh_program(&state);
        draw_gl_shape_mesh_batch(&mut state, &proxy, &[], &binding, None);
        assert_eq!(count_calls("use_program"), 0);
    }
}

mod draw_gl_shape_meshes {
    use super::*;

    #[test]
    fn binds_the_mesh_program_and_draws_each_mesh() {
        let mut state = create_gl_state();
        let proxy = make_proxy(&mut state);

        draw_gl_shape_meshes(&mut state, &proxy, &[triangle()]);

        assert!(count_calls("use_program") > 0);
        let draws = calls_with("draw_elements");
        assert_eq!(draws.len(), 1);
        assert_eq!(
            draws[0].integers[..3],
            [
                i64::from(glow::TRIANGLES),
                3,
                i64::from(glow::UNSIGNED_SHORT)
            ]
        );
    }

    #[test]
    fn records_the_mesh_program_as_current_shader_so_content_draws_re_bind() {
        let mut state = create_gl_state();
        let proxy = make_proxy(&mut state);
        assert!(state.context_state.runtime_state.borrow().binding.is_none());

        draw_gl_shape_meshes(&mut state, &proxy, &[triangle()]);

        assert!(state.context_state.runtime_state.borrow().binding.is_some());
    }

    #[test]
    fn uploads_premultiplied_color_color_times_alpha_for_the_standard_blend() {
        let mut state = create_gl_state();
        let proxy = make_proxy(&mut state);
        let mut mesh = triangle();
        mesh.color = 0xffffffff;
        mesh.alpha = 0.5;

        draw_gl_shape_meshes(&mut state, &proxy, &[mesh]);

        assert!(
            calls_with("uniform_4_f32")
                .iter()
                .any(|call| call.floats == vec![0.5, 0.5, 0.5, 0.5])
        );
    }

    #[test]
    fn skips_fully_transparent_meshes() {
        let mut state = create_gl_state();
        let proxy = make_proxy(&mut state);
        let mut mesh = triangle();
        mesh.alpha = 0.0;

        draw_gl_shape_meshes(&mut state, &proxy, &[mesh]);

        assert_eq!(count_calls("draw_elements"), 0);
    }

    #[test]
    fn is_a_no_op_for_an_empty_mesh_list() {
        let mut state = create_gl_state();
        let proxy = make_proxy(&mut state);

        draw_gl_shape_meshes(&mut state, &proxy, &[]);

        assert_eq!(count_calls("use_program"), 0);
    }

    #[test]
    fn ignores_a_color_adjustment_when_color_adjustment_is_not_enabled_default_path_pays_nothing() {
        let mut state = create_gl_state();
        let mut proxy = make_proxy(&mut state);
        proxy.color_scale_bias = Some(make_ct(0.5));

        draw_gl_shape_meshes(&mut state, &proxy, &[triangle()]);

        let context = state.context_state.runtime_state.borrow();
        assert!(
            context
                .shape_mesh_resources
                .as_ref()
                .and_then(|resources| resources.color_scale_bias_shader.as_ref())
                .is_none()
        );
    }

    #[test]
    fn tints_solid_fill_meshes_through_the_fold_with_the_same_uniforms_as_the_quad_batch_path() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let mut proxy = make_proxy(&mut state);
        proxy.color_scale_bias = Some(make_color_scale_bias(
            0.5, 0.5, 0.5, 1.0, 0.5, 0.0, 0.0, 0.0,
        ));
        let mut mesh = triangle();
        mesh.color = 0xffffffff;

        draw_gl_shape_meshes(&mut state, &proxy, &[mesh]);

        let shader = state
            .context_state
            .runtime_state
            .borrow()
            .shape_mesh_resources
            .as_ref()
            .unwrap()
            .color_scale_bias_shader
            .clone()
            .unwrap();
        assert!(has_uniform_4(
            shader.color_scale_location.as_ref(),
            [0.5, 0.5, 0.5, 1.0]
        ));
        assert!(has_uniform_4(
            shader.color_bias_location.as_ref(),
            [0.5, 0.0, 0.0, 0.0]
        ));
        assert!(has_uniform_4(
            shader.color_location.as_ref(),
            [1.0, 1.0, 1.0, 1.0]
        ));
        assert_eq!(count_calls("draw_elements"), 1);
    }

    #[test]
    fn falls_back_to_the_lean_path_through_the_fold_when_the_node_carries_no_transform() {
        let mut state = create_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let proxy = make_proxy(&mut state);

        draw_gl_shape_meshes(&mut state, &proxy, &[triangle()]);

        let context = state.context_state.runtime_state.borrow();
        assert!(
            context
                .shape_mesh_resources
                .as_ref()
                .and_then(|resources| resources.color_scale_bias_shader.as_ref())
                .is_none()
        );
    }
}

mod ensure_gl_shape_mesh_program {
    use super::*;

    #[test]
    fn compiles_once_and_caches_the_binding_per_context() {
        let state = create_gl_state();
        let first = ensure_gl_shape_mesh_program(&state);
        let second = ensure_gl_shape_mesh_program(&state);
        assert_eq!(second, first);
        assert_eq!(count_calls("create_program"), 1);
    }

    #[test]
    fn exposes_shared_vertex_and_index_buffers_for_the_draw_driver() {
        let state = create_gl_state();
        let binding = ensure_gl_shape_mesh_program(&state);
        assert_ne!(binding.vertex_buffer, binding.index_buffer);
    }
}
