use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_lighting::{Environment, create_environment};
use flight_render_gl::GlRenderState;
use flight_scene3d_gl::contract::*;
use flight_texture::{
    Texture, TextureColorSpace, TextureSourceRef, TextureUvTransform, create_cube_texture,
};
use glow::HasContext;

use crate::gl_test_helper::{call_names, calls_with, count_calls, make_gl_scene3d_state};

// The skybox draw itself is validated by the functional `env-skybox` capture. This covers the guard:
// with no complete source cube the pass is a no-op (it must not touch GL), so an app that always calls
// it before render_gl_scene3d pays nothing until an environment is bound.

fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 0.1;
    let projection = create_perspective_projection();
    {
        let mut perspective = projection.write().unwrap();
        perspective.aspect = 1.0;
        perspective.fov_y = 1.0;
    }
    camera.projection = Projection::Perspective(projection);
    return camera;
}

fn cube_environment() -> Environment {
    let face: TextureSourceRef = Arc::new(RwLock::new(create_bitmap(4, 4, None)));
    let mut cube = create_cube_texture();
    cube.texture_fields_mut().color_space = TextureColorSpace::Srgb;
    cube.sources = std::array::from_fn(|_| Some(face.clone()));
    let mut environment = create_environment();
    environment.environment = Some(Arc::new(RwLock::new(Texture::Cube(cube))));
    environment.intensity = 1.0;
    return environment;
}

// A complete six-face cube is what makes render_gl_environment_skybox build its GPU resources rather
// than return early, which is the state the teardown cases are about.
fn draw_skybox_once(state: &GlRenderState) {
    render_gl_environment_skybox(state, &cube_environment(), &make_camera(), 1.0);
}

mod destroy_gl_environment_skybox {
    use super::*;

    #[test]
    fn is_a_no_op_when_no_skybox_has_been_drawn_for_the_state() {
        let mut state = make_gl_scene3d_state();
        let before = call_names().len();
        destroy_gl_environment_skybox(&mut state);
        assert_eq!(call_names().len(), before);
    }

    #[test]
    fn frees_the_program_vao_and_vertex_buffer_so_nothing_outlives_the_one_call_teardown() {
        let mut state = make_gl_scene3d_state();
        draw_skybox_once(&state);

        // The delta across the teardown call, not a total: the source-cube upload creates objects of
        // its own, so a whole-run count would credit those to the skybox.
        let before = (
            count_calls("delete_buffers"),
            count_calls("delete_program"),
            count_calls("delete_vertex_arrays"),
        );
        destroy_gl_environment_skybox(&mut state);

        // Exactly the skybox's three objects. The vertex buffer is the one that used to escape: the VAO
        // holds the only other reference to it and a VAO does not own its buffers.
        assert_eq!(count_calls("delete_buffers") - before.0, 1);
        assert_eq!(count_calls("delete_program") - before.1, 1);
        assert_eq!(count_calls("delete_vertex_arrays") - before.2, 1);
    }

    #[test]
    fn drops_the_cache_so_a_later_draw_rebuilds_rather_than_binding_freed_objects() {
        let mut state = make_gl_scene3d_state();
        draw_skybox_once(&state);
        destroy_gl_environment_skybox(&mut state);
        let before_second = count_calls("create_program");
        draw_skybox_once(&state);
        assert!(count_calls("create_program") > before_second);
    }
}

mod render_gl_environment_skybox {
    use super::*;

    #[test]
    fn is_a_no_op_when_the_environment_has_no_source_cube() {
        let state = make_gl_scene3d_state();
        let mut environment = create_environment();
        environment.environment = None;
        environment.intensity = 1.0;
        let before = call_names().len();
        render_gl_environment_skybox(&state, &environment, &make_camera(), 1.0);
        assert_eq!(call_names().len(), before);
    }

    #[test]
    fn restores_the_depth_test_and_blend_bits_the_caller_had() {
        let state = make_gl_scene3d_state();
        // Both ON going in, which is what a caller mid-frame actually has. The pass turns both off for
        // its own draw; blend was previously never turned back on, and the 2D path enables blend once
        // per state, so that leak outlived the frame it happened in.
        // SAFETY: mock GL calls on the test thread.
        unsafe {
            state.gl.enable(glow::DEPTH_TEST);
            state.gl.enable(glow::BLEND);
        }

        render_gl_environment_skybox(&state, &cube_environment(), &make_camera(), 1.0);

        // SAFETY: mock GL queries on the test thread.
        unsafe {
            assert!(state.gl.is_enabled(glow::DEPTH_TEST));
            assert!(state.gl.is_enabled(glow::BLEND));
        }
    }

    #[test]
    fn refreshes_and_uploads_camera3d_inverse_view_projection() {
        let state = make_gl_scene3d_state();
        let camera = make_camera();
        camera.inverse_view_projection.write().unwrap().m[0] = 42.0;
        render_gl_environment_skybox(&state, &cube_environment(), &camera, 1.0);
        let inverse = camera.inverse_view_projection.read().unwrap().m;
        assert_ne!(inverse[0], 42.0);
        assert!(
            calls_with("uniform_matrix_4_f32")
                .iter()
                .any(|call| call.floats == inverse.to_vec())
        );
    }
}
