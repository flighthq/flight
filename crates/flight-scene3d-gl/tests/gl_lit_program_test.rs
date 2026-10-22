use std::rc::Rc;
use flight_geometry::create_matrix4;
use flight_lighting::{SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock};
use flight_render_gl::GlRenderState;
use flight_scene3d_gl::contract::*;
use glow::HasContext;

use crate::gl_test_helper::{calls_with, clear_calls, make_gl_scene3d_state, uniform_location_of};

fn make_lit_program(state: &GlRenderState) -> GlLitProgram {
    // SAFETY: the mock context allocates names on the test thread.
    let program = unsafe { state.gl.create_program() }.unwrap();
    let lit = resolve_gl_lit_locations(&state.gl, program);
    clear_calls();
    return lit;
}

fn block(
    ambient_count: usize,
    directional_count: usize,
    hemisphere_count: usize,
    point_count: usize,
    spot_count: usize,
    version: u32,
) -> Rc<Scene3DLightBlock> {
    return Rc::new(make_block(
        ambient_count,
        directional_count,
        hemisphere_count,
        point_count,
        spot_count,
        version,
    ));
}

fn make_block(
    ambient_count: usize,
    directional_count: usize,
    hemisphere_count: usize,
    point_count: usize,
    spot_count: usize,
    version: u32,
) -> Scene3DLightBlock {
    return Scene3DLightBlock {
        ambient_count,
        data: vec![0.0; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
        directional_count,
        hemisphere_count,
        point_count,
        spot_count,
        version,
    };
}

fn ibl(state: &GlRenderState, revision: u32, intensity: f32) -> GlScene3DIbl {
    // SAFETY: the mock context allocates names on the test thread.
    unsafe {
        return GlScene3DIbl {
            brdf_lut: state.gl.create_texture().unwrap(),
            environment_source_revision: revision,
            intensity,
            irradiance_cube: state.gl.create_texture().unwrap(),
            prefiltered_cube: state.gl.create_texture().unwrap(),
            prefiltered_mip_count: 5,
        };
    }
}

fn scalar(name: &str) -> Option<f32> {
    let location = i64::from(uniform_location_of(name));
    if let Some(call) = calls_with("uniform_1_f32")
        .into_iter()
        .find(|call| call.integers[0] == location)
    {
        return Some(call.floats[0]);
    }
    return calls_with("uniform_1_i32")
        .into_iter()
        .find(|call| call.integers[0] == location)
        .map(|call| call.integers[1] as f32);
}

mod bind_gl_mesh_light_block {
    use super::*;

    #[test]
    fn binds_ibl_only_when_its_environment_source_revision_is_current() {
        let state = make_gl_scene3d_state();
        {
            let baked = ibl(&state, 2, 0.75);
            let mut runtime = get_gl_scene3d_runtime(&state);
            runtime.environment_source_revision = 2;
            runtime.ibl = Some(baked);
        }
        let program = make_lit_program(&state);
        bind_gl_mesh_light_block(&state, &program, &block(0, 0, 0, 0, 0, 1));
        assert_eq!(scalar("u_iblEnabled"), Some(1.0));
    }

    #[test]
    fn disables_a_stale_ibl_bake_after_the_environment_source_revision_advances() {
        let state = make_gl_scene3d_state();
        {
            let baked = ibl(&state, 1, 1.0);
            let mut runtime = get_gl_scene3d_runtime(&state);
            runtime.environment_source_revision = 2;
            runtime.ibl = Some(baked);
        }
        let program = make_lit_program(&state);
        bind_gl_mesh_light_block(&state, &program, &block(0, 0, 0, 0, 0, 1));
        assert_eq!(scalar("u_iblEnabled"), Some(0.0));
    }

    #[test]
    fn uploads_the_directional_ambient_count_shadow_gate_and_ibl_gate_uniforms_from_the_packed_block() {
        let state = make_gl_scene3d_state();
        let mut lights = make_block(1, 1, 0, 0, 0, 1);
        lights.data[0] = 0.0;
        lights.data[1] = -1.0;
        lights.data[4] = 1.0;
        lights.data[5] = 1.0;
        lights.data[6] = 1.0;
        lights.data[8] = 0.2;
        let program = make_lit_program(&state);
        bind_gl_mesh_light_block(&state, &program, &Rc::new(lights));
        assert_eq!(calls_with("uniform_4_f32").len(), 2);
        assert_eq!(calls_with("uniform_3_f32").len(), 1);
        // directionalCount + ambientCount + shadowEnabled (0, no active shadow) + iblEnabled (0, no IBL).
        assert_eq!(calls_with("uniform_1_f32").len(), 4);
    }

    #[test]
    fn skips_the_light_uniform_upload_when_the_program_already_holds_the_block_version() {
        let state = make_gl_scene3d_state();
        let program = make_lit_program(&state);
        let lights = block(1, 1, 0, 0, 0, 7);
        bind_gl_mesh_light_block(&state, &program, &lights);
        bind_gl_mesh_light_block(&state, &program, &lights);
        // Two binds, one program, one version: only the light block is gated.
        assert_eq!(calls_with("uniform_4_f32").len(), 2);
        assert_eq!(calls_with("uniform_3_f32").len(), 1);
    }

    #[test]
    fn re_uploads_the_light_uniforms_when_the_block_version_changes() {
        let state = make_gl_scene3d_state();
        let program = make_lit_program(&state);
        let lights = block(1, 1, 0, 0, 0, 1);
        bind_gl_mesh_light_block(&state, &program, &lights);
        // A held block is immutable in Rust, so a repack arrives as a new handle carrying the
        // advanced version (prepare_gl_scene3d_forward_lights replaces a changed block the same way).
        let mut repacked = (*lights).clone();
        repacked.version = 2;
        bind_gl_mesh_light_block(&state, &program, &Rc::new(repacked));
        assert_eq!(calls_with("uniform_4_f32").len(), 4);
    }

    // Ruling 5: the cache holds the uploaded block, so a dropped caller handle cannot free the
    // allocation and let a later block alias it; a fresh block always re-uploads.
    #[test]
    fn holds_the_uploaded_block_so_a_later_block_cannot_alias_its_identity() {
        let state = make_gl_scene3d_state();
        let program = make_lit_program(&state);
        let first = block(0, 0, 0, 1, 0, 1);
        bind_gl_mesh_light_block(&state, &program, &first);
        assert_eq!(Rc::strong_count(&first), 2);
        drop(first);
        let second = block(0, 0, 0, 1, 0, 1);
        bind_gl_mesh_light_block(&state, &program, &second);
        assert_eq!(calls_with("uniform_4_f32").len(), 4);
    }

    #[test]
    fn re_uploads_when_a_different_per_object_block_has_the_same_version() {
        let state = make_gl_scene3d_state();
        let program = make_lit_program(&state);
        let first = block(0, 0, 0, 1, 0, 1);
        let second = block(0, 0, 0, 1, 0, 1);
        bind_gl_mesh_light_block(&state, &program, &first);
        bind_gl_mesh_light_block(&state, &program, &second);
        assert_eq!(calls_with("uniform_4_f32").len(), 4);
    }

    #[test]
    fn uploads_the_punctual_light_arrays_and_their_int_counts_from_the_packed_block() {
        let state = make_gl_scene3d_state();
        let program = make_lit_program(&state);
        bind_gl_mesh_light_block(&state, &program, &block(0, 0, 3, 2, 1, 1));
        // Three vec4 arrays uploaded: point, spot, hemisphere.
        assert_eq!(calls_with("uniform_4_f32_slice").len(), 3);
        // Each count uploads as an int uniform.
        let count_of = |name: &str| -> Option<i64> {
            let location = i64::from(uniform_location_of(name));
            return calls_with("uniform_1_i32")
                .into_iter()
                .find(|call| call.integers[0] == location)
                .map(|call| call.integers[1]);
        };
        assert_eq!(count_of("u_pointCount"), Some(2));
        assert_eq!(count_of("u_spotCount"), Some(1));
        assert_eq!(count_of("u_hemisphereCount"), Some(3));
    }

    #[test]
    fn uploads_the_active_directional_shadow_filter_and_bias_configuration() {
        let state = make_gl_scene3d_state();
        {
            // SAFETY: the mock context allocates names on the test thread.
            let texture = unsafe { state.gl.create_texture() }.unwrap();
            get_gl_scene3d_runtime(&state).shadow = Some(GlScene3DShadow {
                enabled: true,
                matrix: create_matrix4(),
                normal_bias_world: 0.02,
                pcf_radius: 2.0,
                shadow_bias: 0.01,
                texture,
            });
        }
        let program = make_lit_program(&state);

        bind_gl_mesh_light_block(&state, &program, &block(0, 1, 0, 0, 0, 1));

        assert_eq!(scalar("u_shadowEnabled"), Some(1.0));
        assert_eq!(scalar("u_shadowPcfRadius"), Some(2.0));
        assert_eq!(scalar("u_shadowBias"), Some(0.01));
        assert_eq!(scalar("u_shadowNormalBiasWorld"), Some(0.02));
    }
}

mod gl_mesh_light_block_glsl {
    use super::*;

    #[test]
    fn declares_every_uniform_the_cpu_upload_sets() {
        for name in [
            "u_directional",
            "u_directionalRadiance",
            "u_ambientRadiance",
            "u_directionalCount",
            "u_ambientCount",
            "u_cameraPosition",
            "u_shadowMap",
            "u_shadowMatrix",
            "u_shadowEnabled",
            "u_shadowPcfRadius",
            "u_shadowBias",
            "u_shadowNormalBiasWorld",
            "u_pointLights",
            "u_spotLights",
            "u_hemisphereLights",
            "u_pointCount",
            "u_spotCount",
            "u_hemisphereCount",
        ] {
            assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains(name), "missing {name}");
        }
    }

    #[test]
    fn uses_a_bounded_runtime_pcf_radius_and_configurable_receiver_biases() {
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal)"));
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("geometricNormal * u_shadowNormalBiasWorld"));
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("uvz.z - u_shadowBias"));
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("if (radius == 0) return compareDirectionalShadow(uvz.xy, current)"));
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("if (radius == 1)"));
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("for (int x = -1; x <= 1; ++x)"));
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("for (int x = -2; x <= 2; ++x)"));
        assert!(GL_MESH_LIGHT_BLOCK_GLSL.contains("return sum / 9.0"));
        assert!(!GL_MESH_LIGHT_BLOCK_GLSL.contains("0.0025"));
    }
}

mod resolve_gl_lit_locations {
    use super::*;

    #[test]
    fn resolves_the_standard_lit_uniform_locations() {
        let state = make_gl_scene3d_state();
        // SAFETY: the mock context allocates names on the test thread.
        let program = unsafe { state.gl.create_program() }.unwrap();
        let locations = resolve_gl_lit_locations(&state.gl, program);
        assert!(locations.loc_directional.is_some());
        assert!(locations.loc_ambient_radiance.is_some());
        assert!(locations.loc_camera_position.is_some());
        assert!(locations.loc_shadow_map.is_some());
        assert!(locations.loc_shadow_pcf_radius.is_some());
        assert!(locations.loc_shadow_bias.is_some());
        assert!(locations.loc_shadow_normal_bias_world.is_some());
    }
}
