use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_lighting::{Environment, create_environment};
use flight_render_gl::{GlCubeRenderTarget, GlRenderState, initialize_gl_cube_render_target};
use flight_scene3d_gl::*;
use flight_texture::{Texture, TextureColorSpace, TextureSourceRef, TextureUvTransform, create_cube_texture};
use glow::{HasContext, NativeTexture};

use crate::gl_test_helper::{call_names, calls_with, make_gl_scene3d_state};

// The GPU bake (irradiance / prefiltered specular / BRDF LUT) is validated by the functional `env-ibl`
// capture — the mock has no float-cube render path. This covers the guards and the ownership handoff:
// with no source cube the bake is a no-op and leaves runtime.ibl None, so the PBR ambient falls back to
// the flat term.

fn data_only_environment(size: u32) -> Environment {
    let face: TextureSourceRef = Arc::new(RwLock::new(create_bitmap(size, size, None)));
    let mut cube = create_cube_texture();
    cube.texture_fields_mut().color_space = TextureColorSpace::Srgb;
    cube.sources = std::array::from_fn(|_| Some(face.clone()));
    let mut environment = create_environment();
    environment.environment = Some(Arc::new(RwLock::new(Texture::Cube(cube))));
    environment.intensity = 1.0;
    return environment;
}

fn texture(state: &GlRenderState) -> NativeTexture {
    // SAFETY: the mock context allocates names on the test thread.
    return unsafe { state.gl.create_texture() }.unwrap();
}

fn texture_name(texture: NativeTexture) -> i64 {
    return i64::from(texture.0.get());
}

fn capture_target(state: &GlRenderState, texture: NativeTexture) -> GlCubeRenderTarget {
    // SAFETY: the mock context allocates names on the test thread.
    let framebuffer = unsafe { state.gl.create_framebuffer() }.unwrap();
    let delete_queue = state.context_state.runtime_state.borrow().delete_queue.clone();
    return initialize_gl_cube_render_target(state.gl.clone(), 4, framebuffer, texture, None, delete_queue);
}

fn deleted_textures() -> Vec<i64> {
    return calls_with("delete_textures")
        .into_iter()
        .flat_map(|call| call.integers)
        .collect();
}

mod bake_gl_environment_capture_ibl {
    use super::*;

    #[test]
    fn bakes_from_the_capture_texture_without_destroying_the_environment_source_cube() {
        let state = make_gl_scene3d_state();
        let environment = data_only_environment(4);
        let previous_source = ensure_gl_environment_source_cube(&state, &environment).unwrap();
        let captured_texture = texture(&state);

        bake_gl_environment_capture_ibl(&state, &capture_target(&state, captured_texture), Some(2.5));

        let runtime = get_gl_scene3d_runtime(&state);
        assert_eq!(runtime.environment_source_cube, Some(previous_source));
        let ibl = runtime.ibl.expect("the capture bake stores an IBL set");
        assert_eq!(ibl.environment_source_revision, runtime.environment_source_revision);
        assert_eq!(ibl.intensity, 2.5);
        assert!(!deleted_textures().contains(&texture_name(previous_source)));
        assert!(
            calls_with("bind_texture")
                .iter()
                .any(|call| call.integers[1] == texture_name(captured_texture))
        );
    }
}

mod bake_gl_environment_ibl {
    use super::*;

    #[test]
    fn is_a_no_op_leaving_runtime_ibl_null_when_the_environment_has_no_source_cube() {
        let state = make_gl_scene3d_state();
        let mut environment = create_environment();
        environment.environment = None;
        environment.intensity = 1.0;
        bake_gl_environment_ibl(&state, &environment);
        assert!(get_gl_scene3d_runtime(&state).ibl.is_none());
    }
}

// TS describe('bakeGlEnvironmentIbl rebake ownership').
mod bake_gl_environment_ibl_rebake_ownership {
    use super::*;

    #[test]
    fn frees_the_irradiance_and_prefiltered_cubes_it_replaces_and_keeps_the_reused_brdf_lut() {
        let state = make_gl_scene3d_state();
        let mut environment = data_only_environment(4);
        ensure_gl_environment_source_cube(&state, &environment);
        // Stand in for a prior bake: the replaced set is planted directly — what is under test is the
        // ownership handoff, not the bake.
        let previous = GlScene3DIbl {
            brdf_lut: texture(&state),
            environment_source_revision: get_gl_scene3d_runtime(&state)
                .environment_source_revision
                .wrapping_sub(1),
            intensity: 1.0,
            irradiance_cube: texture(&state),
            prefiltered_cube: texture(&state),
            prefiltered_mip_count: 5,
        };
        get_gl_scene3d_runtime(&state).ibl = Some(previous);
        environment.intensity = 2.0;
        bake_gl_environment_ibl(&state, &environment);

        let deleted = deleted_textures();
        assert!(deleted.contains(&texture_name(previous.irradiance_cube)));
        assert!(deleted.contains(&texture_name(previous.prefiltered_cube)));
        // The LUT is environment-independent and is carried forward into the new set, so freeing it
        // would delete a texture the runtime still points at.
        assert!(!deleted.contains(&texture_name(previous.brdf_lut)));
    }

    #[test]
    fn updates_intensity_without_rebaking_when_the_environment_source_revision_is_unchanged() {
        let state = make_gl_scene3d_state();
        let mut environment = data_only_environment(4);
        ensure_gl_environment_source_cube(&state, &environment);
        let planted = GlScene3DIbl {
            brdf_lut: texture(&state),
            environment_source_revision: get_gl_scene3d_runtime(&state).environment_source_revision,
            intensity: 1.0,
            irradiance_cube: texture(&state),
            prefiltered_cube: texture(&state),
            prefiltered_mip_count: 5,
        };
        get_gl_scene3d_runtime(&state).ibl = Some(planted);
        let calls_before = call_names().len();
        environment.intensity = 3.0;

        bake_gl_environment_ibl(&state, &environment);

        assert_eq!(get_gl_scene3d_runtime(&state).ibl.unwrap().intensity, 3.0);
        let after = call_names()[calls_before..].to_vec();
        assert!(!after.iter().any(|name| name == "gen_framebuffers"));
        assert!(!after.iter().any(|name| name == "delete_textures"));
    }
}

mod destroy_gl_environment_ibl_bake_programs {
    use super::*;

    // With no bake having run for the state, teardown is a safe, repeatable no-op that issues no GL
    // deletes.
    #[test]
    fn is_a_safe_no_op_when_no_bake_ran_for_the_state() {
        let mut state = make_gl_scene3d_state();
        destroy_gl_environment_ibl_bake_programs(&mut state);
        destroy_gl_environment_ibl_bake_programs(&mut state);
        assert!(!call_names().iter().any(|name| name.starts_with("delete")));
    }
}
