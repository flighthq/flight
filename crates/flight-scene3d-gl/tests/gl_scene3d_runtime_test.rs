use std::cell::Cell;
use std::rc::Rc;
use std::sync::Arc;

use flight_geometry::create_matrix4;
use flight_render::{RenderTargetDepth, RenderTargetDescriptor};
use flight_render_gl::{GlRenderState, create_gl_texture_render_target};
use flight_scene3d_gl::contract::*;
use glow::HasContext;

use crate::gl_test_helper::{call_names, calls_with, make_gl_scene3d_state};

thread_local! {
    static CLEANUP_CALLS: Cell<u32> = const { Cell::new(0) };
    static SEEN_STATE: Cell<u64> = const { Cell::new(0) };
}

fn counting_cleanup(_state: &mut GlRenderState) {
    CLEANUP_CALLS.with(|calls| calls.set(calls.get() + 1));
}

fn recording_cleanup(state: &mut GlRenderState) {
    SEEN_STATE.with(|seen| seen.set(flight_entity::get_entity_id(state)));
}

fn deletes() -> usize {
    return call_names()
        .iter()
        .filter(|name| name.starts_with("delete"))
        .count();
}

fn texture(state: &GlRenderState) -> glow::NativeTexture {
    // SAFETY: the mock context allocates names on the test thread.
    return unsafe { state.gl.create_texture() }.unwrap();
}

mod add_gl_scene3d_resource_cleanup {
    use super::*;

    #[test]
    fn runs_a_registered_cleanup_on_teardown_and_clears_the_list() {
        let mut state = make_gl_scene3d_state();
        CLEANUP_CALLS.with(|calls| calls.set(0));
        add_gl_scene3d_resource_cleanup(&state, counting_cleanup);
        destroy_gl_scene3d_runtime(&mut state);
        assert_eq!(CLEANUP_CALLS.with(Cell::get), 1);
        // Cleared, so a second teardown does not re-run a cleanup whose resource is already freed.
        destroy_gl_scene3d_runtime(&mut state);
        assert_eq!(CLEANUP_CALLS.with(Cell::get), 1);
    }

    #[test]
    fn is_idempotent_by_function_identity_so_re_creating_a_resource_registers_nothing_new() {
        let mut state = make_gl_scene3d_state();
        CLEANUP_CALLS.with(|calls| calls.set(0));
        add_gl_scene3d_resource_cleanup(&state, counting_cleanup);
        add_gl_scene3d_resource_cleanup(&state, counting_cleanup);
        destroy_gl_scene3d_runtime(&mut state);
        assert_eq!(CLEANUP_CALLS.with(Cell::get), 1);
    }

    #[test]
    fn passes_the_state_through_so_a_cleanup_can_free_the_gpu_objects_of_that_state() {
        let mut state = make_gl_scene3d_state();
        SEEN_STATE.with(|seen| seen.set(0));
        add_gl_scene3d_resource_cleanup(&state, recording_cleanup);
        destroy_gl_scene3d_runtime(&mut state);
        assert_eq!(
            SEEN_STATE.with(Cell::get),
            flight_entity::get_entity_id(&state)
        );
    }
}

mod destroy_gl_scene3d_runtime {
    use super::*;

    #[test]
    fn is_a_safe_no_op_when_the_state_never_allocated_a_scene_runtime() {
        let mut state = make_gl_scene3d_state();
        destroy_gl_scene3d_runtime(&mut state);
        assert_eq!(deletes(), 0);
    }

    #[test]
    fn drops_the_program_keyed_upload_records_with_the_deleted_programs() {
        let mut state = make_gl_scene3d_state();
        {
            // SAFETY: the mock context allocates names on the test thread.
            let program = unsafe { state.gl.create_program() }.unwrap();
            let mut scene = get_gl_scene3d_runtime(&state);
            scene.uploaded_light_blocks.insert(
                program,
                (
                    Rc::new(flight_lighting::Scene3DLightBlock {
                        ambient_count: 0,
                        data: vec![0.0_f32; 4].into_boxed_slice(),
                        directional_count: 0,
                        hemisphere_count: 0,
                        point_count: 0,
                        spot_count: 0,
                        version: 1,
                    }),
                    1,
                ),
            );
            scene.custom_shader_checked_programs.insert(program);
        }

        destroy_gl_scene3d_runtime(&mut state);

        let scene = get_gl_scene3d_runtime(&state);
        assert!(scene.uploaded_light_blocks.is_empty());
        assert!(scene.custom_shader_checked_programs.is_empty());
    }

    #[test]
    fn clears_an_allocated_runtime_with_no_optional_gpu_resources() {
        let mut state = make_gl_scene3d_state();
        drop(get_gl_scene3d_runtime(&state));

        destroy_gl_scene3d_runtime(&mut state);

        assert_eq!(deletes(), 0);
        let scene = get_gl_scene3d_runtime(&state);
        assert!(scene.blended_draw_list.is_empty());
        assert!(scene.opaque_draw_list.is_empty());
    }

    #[test]
    fn frees_the_cached_programs_the_ibl_set_the_environment_cube_and_the_shadow_target_then_clears_the_slots()
     {
        let mut state = make_gl_scene3d_state();
        // SAFETY: the mock context allocates names on the test thread.
        let bake_framebuffer = unsafe { state.gl.create_framebuffer().unwrap() };
        let program_a = crate::gl_test_helper::make_test_mesh_program(&state);
        let program_b = crate::gl_test_helper::make_test_mesh_program(&state);
        let (brdf, irradiance, prefiltered, cube) = (
            texture(&state),
            texture(&state),
            texture(&state),
            texture(&state),
        );
        let shadow_target = create_gl_texture_render_target(
            &state,
            &RenderTargetDescriptor {
                width: 4.0,
                height: 4.0,
                format: None,
                color_attachments: None,
                color_formats: None,
                sample_count: None,
                depth: Some(RenderTargetDepth::DepthStencilSampled),
                color_space: None,
            },
            None,
        )
        .unwrap()
        .unwrap();
        let depth_texture = shadow_target.depth_texture.unwrap();
        let palette = flight_render_gl::create_gl_skin_palette_texture(&state).unwrap();
        {
            let mut scene = get_gl_scene3d_runtime(&state);
            let a: GlMeshProgramRef = Rc::new(program_a);
            let b: GlMeshProgramRef = Rc::new(program_b);
            scene.program_cache.insert("a".to_string(), a.clone());
            scene.program_cache.insert("b".to_string(), b);
            scene.active_mesh_program = Some(a);
            scene.ibl = Some(GlScene3DIbl {
                brdf_lut: brdf,
                environment_source_revision: 1,
                intensity: 1.0,
                irradiance_cube: irradiance,
                prefiltered_cube: prefiltered,
                prefiltered_mip_count: 5,
            });
            scene.ibl_bake_framebuffer = Some(bake_framebuffer);
            scene.environment_source_cube = Some(cube);
            scene.environment_source_cube_face_versions = vec![1, 1, 1, 1, 1, 1];
            scene.environment_source_revision = 1;
            scene.environment_source_texture = Some(1);
            scene.environment_source_texture_version = 1;
            scene.shadow_target = Some(shadow_target);
            scene.shadow = Some(GlScene3DShadow {
                enabled: true,
                matrix: create_matrix4(),
                normal_bias_world: 0.0,
                pcf_radius: 0.0,
                shadow_bias: 0.0,
                texture: depth_texture,
            });
            scene.skin_palette = Some(palette);
        }
        crate::gl_test_helper::clear_calls();

        destroy_gl_scene3d_runtime(&mut state);

        assert_eq!(calls_with("delete_program").len(), 2);
        // 3 IBL textures + the environment source cube + the shadow target's textures (the native target
        // owns a color attachment beside the sampled depth texture) + the skin-palette data texture.
        assert_eq!(calls_with("delete_textures").len(), 7);
        // The IBL bake framebuffer + the shadow target's framebuffer.
        assert_eq!(calls_with("delete_framebuffers").len(), 2);

        let scene = get_gl_scene3d_runtime(&state);
        assert!(scene.program_cache.is_empty());
        assert!(scene.active_mesh_program.is_none());
        assert!(scene.ibl.is_none());
        assert!(scene.ibl_bake_framebuffer.is_none());
        assert!(scene.environment_source_cube.is_none());
        assert!(scene.environment_source_cube_face_versions.is_empty());
        assert!(scene.environment_source_texture.is_none());
        assert_eq!(scene.environment_source_texture_version, -1);
        assert!(scene.shadow_target.is_none());
        assert!(scene.shadow.is_none());
        assert!(scene.skin_palette.is_none());
    }
}

mod destroy_gl_scene3d_runtime_skybox_ownership {
    use super::*;

    #[test]
    fn reaches_the_skybox_program_vao_and_vertex_buffer_which_live_outside_the_runtime() {
        let mut state = make_gl_scene3d_state();
        let face: flight_texture::TextureSourceRef = Arc::new(std::sync::RwLock::new(
            flight_bitmap::create_bitmap(4, 4, None),
        ));
        let mut cube = flight_texture::create_cube_texture();
        flight_texture::TextureUvTransform::texture_fields_mut(&mut cube).color_space =
            flight_texture::TextureColorSpace::Srgb;
        cube.sources = std::array::from_fn(|_| Some(face.clone()));
        let mut environment = flight_lighting::create_environment();
        environment.environment = Some(Arc::new(std::sync::RwLock::new(
            flight_texture::Texture::Cube(cube),
        )));
        environment.intensity = 1.0;
        let camera = crate::gl_test_helper::make_test_camera();
        render_gl_environment_skybox(&state, &environment, &camera, 1.0);

        let before = (
            calls_with("delete_buffers").len(),
            calls_with("delete_vertex_arrays").len(),
        );
        destroy_gl_scene3d_runtime(&mut state);

        // These were the only GPU resources the one-call teardown could not reach directly: they are
        // cached outside the runtime's own fields, so the runtime has to know to ask.
        assert!(calls_with("delete_buffers").len() > before.0);
        assert!(calls_with("delete_vertex_arrays").len() > before.1);
    }
}

mod ensure_gl_instance_color_palette {
    use super::*;

    #[test]
    fn creates_a_separate_texture_from_the_matrix_palette_and_reuses_it_after() {
        let state = make_gl_scene3d_state();
        assert!(
            get_gl_scene3d_runtime(&state)
                .instance_color_palette
                .is_none()
        );

        let first = ensure_gl_instance_color_palette(&state).texture;
        assert_eq!(
            get_gl_scene3d_runtime(&state)
                .instance_color_palette
                .as_ref()
                .unwrap()
                .texture,
            first
        );
        assert_eq!(ensure_gl_instance_color_palette(&state).texture, first);
        assert_ne!(ensure_gl_instance_palette(&state).texture, first);
    }
}

mod ensure_gl_instance_palette {
    use super::*;

    #[test]
    fn creates_the_instance_palette_lazily_and_reuses_it_after() {
        let state = make_gl_scene3d_state();
        assert!(get_gl_scene3d_runtime(&state).instance_palette.is_none());

        let first = ensure_gl_instance_palette(&state).texture;
        assert_eq!(
            get_gl_scene3d_runtime(&state)
                .instance_palette
                .as_ref()
                .unwrap()
                .texture,
            first
        );
        assert_eq!(ensure_gl_instance_palette(&state).texture, first);
    }
}

mod ensure_gl_skin_normal_palette {
    use super::*;

    #[test]
    fn creates_a_separate_texture_from_the_pose_palette_and_reuses_it_after() {
        // The two must not alias: they carry different data at different texel strides.
        let state = make_gl_scene3d_state();
        assert!(get_gl_scene3d_runtime(&state).skin_normal_palette.is_none());

        let first = ensure_gl_skin_normal_palette(&state).texture;
        assert_eq!(
            get_gl_scene3d_runtime(&state)
                .skin_normal_palette
                .as_ref()
                .unwrap()
                .texture,
            first
        );
        assert_ne!(ensure_gl_skin_palette(&state).texture, first);

        assert_eq!(ensure_gl_skin_normal_palette(&state).texture, first);
    }
}

mod ensure_gl_skin_palette {
    use super::*;

    #[test]
    fn creates_the_palette_texture_lazily_on_first_call_and_reuses_it_after() {
        let state = make_gl_scene3d_state();
        assert!(get_gl_scene3d_runtime(&state).skin_palette.is_none());

        let (first, capacity) = {
            let palette = ensure_gl_skin_palette(&state);
            (palette.texture, palette.joint_capacity)
        };
        assert_eq!(
            get_gl_scene3d_runtime(&state)
                .skin_palette
                .as_ref()
                .unwrap()
                .texture,
            first
        );
        assert_eq!(capacity, 0);

        assert_eq!(ensure_gl_skin_palette(&state).texture, first);
    }
}

mod get_gl_scene3d_runtime {
    use super::*;

    #[test]
    fn lazily_allocates_one_runtime_per_state_and_returns_the_same_instance() {
        let state = make_gl_scene3d_state();
        let first = {
            let first = get_gl_scene3d_runtime(&state);
            assert!(!first.active_blended_run);
            assert!(first.active_mesh_program.is_none());
            assert!(first.blended_draw_list.is_empty());
            assert!(first.blended_pool.is_empty());
            assert!(first.opaque_draw_list.is_empty());
            assert!(first.opaque_pool.is_empty());
            assert!(first.program_cache.is_empty());
            &*first as *const GlScene3DRuntime
        };
        assert!(std::ptr::eq(&*get_gl_scene3d_runtime(&state), first));
    }

    #[test]
    fn gives_each_render_state_its_own_draw_entry_pools_not_shared_singletons() {
        let state_a = make_gl_scene3d_state();
        let state_b = make_gl_scene3d_state();
        let runtime_a = get_gl_scene3d_runtime(&state_a);
        let runtime_b = get_gl_scene3d_runtime(&state_b);
        assert!(!std::ptr::eq(
            &runtime_a.opaque_pool,
            &runtime_b.opaque_pool
        ));
        assert!(!std::ptr::eq(
            &runtime_a.blended_pool,
            &runtime_b.blended_pool
        ));
        assert!(!std::ptr::eq(
            &runtime_a.opaque_draw_list,
            &runtime_b.opaque_draw_list
        ));
        assert!(!std::ptr::eq(
            &runtime_a.blended_draw_list,
            &runtime_b.blended_draw_list
        ));
    }

    #[test]
    fn surfaces_its_upload_cache_without_replacing_persistent_material_dispatch_policy() {
        let state = make_gl_scene3d_state();
        let materials = state.gl_registries.material_renderers.clone();
        let modifier_snippets = state.gl_registries.modifier_snippets.clone();
        let pbr_extensions = state.gl_registries.pbr_extensions.clone();
        drop(get_gl_scene3d_runtime(&state));
        assert!(Arc::ptr_eq(
            &state.gl_registries.material_renderers,
            &materials
        ));
        assert!(Arc::ptr_eq(
            &state.gl_registries.modifier_snippets,
            &modifier_snippets
        ));
        assert!(Arc::ptr_eq(
            &state.gl_registries.pbr_extensions,
            &pbr_extensions
        ));
        assert!(
            state
                .context_state
                .runtime_state
                .borrow()
                .scene3d_context_runtime
                .is_some()
        );
    }
}
