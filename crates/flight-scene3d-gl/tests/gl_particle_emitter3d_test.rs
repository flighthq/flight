use std::sync::{Arc, RwLock};

use flight_camera::Camera3D;
use flight_entity::Ref;
use flight_geometry::set_vector3;
use flight_host::HostImageSource;
use flight_image::{create_image_resolver_state, create_image_resource};
use flight_lighting::{Scene3DLightsLike, create_scene_3d_lights};
use flight_node::contract::invalidate_node_local_transform;
use flight_node::{Node, NodeRef};
use flight_particleemitter::{
    ParticleEmitter3D, create_particle_emitter_3d, reserve_particle_emitter_3d,
};
use flight_render_gl::{GlImageSourceToken, GlRenderState, GlScene3DPass, register_gl_image_texture_resolver};
use flight_scene3d_gl::*;
use flight_texture::{TextureSourceRef, create_texture_2d};
use flight_textureatlas::{TextureAtlasRotation, add_texture_atlas_region, create_texture_atlas};

use crate::gl_test_helper::{
    bytes_as_f32, calls_with, count_calls, make_gl_scene3d_state, make_test_camera, make_test_scene,
    shader_sources, uniform_location_of,
};

// The atlas image's straight-alpha pixel (alpha below 1, so a premultiplied upload would differ).
const ATLAS_PIXEL: [u8; 4] = [200, 100, 50, 128];

// TS makeCamera(): a perspective camera at the identity view.
fn make_camera() -> Camera3D {
    return make_test_camera();
}

fn make_lights() -> Scene3DLightsLike {
    return create_scene_3d_lights();
}

fn make_emitter_with_particles(count: usize) -> Ref<ParticleEmitter3D> {
    let emitter = create_particle_emitter_3d();
    reserve_particle_emitter_3d(&emitter, count);
    {
        let mut guard = emitter.write().unwrap();
        let data = &mut guard.data;
        data.particle_count = count;
        for i in 0..count {
            let tt = i * 4;
            data.transforms[tt] = i as f32;
            data.transforms[tt + 1] = (i * 2) as f32;
            data.transforms[tt + 2] = 0.0;
            data.transforms[tt + 3] = 1.0;
            data.positions_z[i] = (i * 3) as f32;
            data.alphas[i] = 1.0;
            let ct = i * 3;
            data.colors[ct] = 1.0;
            data.colors[ct + 1] = 1.0;
            data.colors[ct + 2] = 1.0;
            data.ids[i] = 0;
        }
    }
    return emitter;
}

// A single-particle emitter carrying a texture atlas whose sole region is region_width×region_height
// pixels within a 128×128 image. Exercises the atlas draw path — texture upload/bind and quad-size
// normalization — that the plain make_emitter_with_particles (no atlas) never reaches.
fn make_atlas_emitter(
    region_width: f32,
    region_height: f32,
    rotation: TextureAtlasRotation,
) -> Ref<ParticleEmitter3D> {
    let emitter = make_emitter_with_particles(1);
    let source = Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(GlImageSourceToken {
            height: 128,
            pixels: Arc::new(ATLAS_PIXEL.repeat(128 * 128)),
            ready: true,
            width: 128,
        }),
    });
    let image = create_image_resource(source, &create_image_resolver_state());
    {
        let mut guard = image.write().unwrap();
        let fields = flight_texture::TextureSource::texture_source_fields_mut(&mut *guard);
        fields.width = 128;
        fields.height = 128;
    }
    let mut texture = create_texture_2d();
    texture.source = Some(image as TextureSourceRef);
    let atlas = create_texture_atlas();
    {
        let mut atlas = atlas.write().unwrap();
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, region_width, region_height, None, None, None);
        atlas.regions[0].write().unwrap().rotation = rotation;
        atlas.texture = Some(Arc::new(RwLock::new(texture)));
    }
    emitter.write().unwrap().data.atlas = Some(atlas);
    return emitter;
}

fn make_atlas_gl_scene3d_state() -> GlRenderState {
    let mut state = make_gl_scene3d_state();
    register_gl_image_texture_resolver(&mut state);
    return state;
}

fn add_emitter(scene: &NodeRef, emitter: &Ref<ParticleEmitter3D>) {
    let node: NodeRef = emitter.clone();
    flight_node::add_node_child(scene, &node);
}

fn draw(state: &mut GlRenderState, scene: &NodeRef) {
    draw_gl_scene3d_particle_emitter3_ds(state, scene, &make_camera(), &make_lights());
}

fn first_instance_data() -> Vec<f32> {
    let upload = calls_with("buffer_sub_data").into_iter().next().expect("an instance upload");
    return bytes_as_f32(&upload.bytes);
}

// D1 f32 bound (TS: toBeCloseTo, 2 decimal places = 0.005).
fn assert_close(actual: f32, expected: f32) {
    let bound = 0.005_f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound, "{actual} != {expected}");
}

fn has_texture_uniform(value: i64) -> bool {
    let location = i64::from(uniform_location_of("u_hasTexture"));
    return calls_with("uniform_1_i32")
        .iter()
        .any(|call| call.integers[0] == location && call.integers[1] == value);
}

fn pass_list(state: &GlRenderState) -> Option<Vec<GlScene3DPass>> {
    return state.gl_registries.passes.as_ref().map(|passes| passes.to_vec());
}

mod destroy_gl_particle_emitter3d_shader {
    use super::*;

    #[test]
    fn is_a_no_op_when_no_shader_was_created() {
        let state = make_gl_scene3d_state();
        destroy_gl_particle_emitter3d_shader(&state);
        assert_eq!(count_calls("delete_program"), 0);
    }

    #[test]
    fn deletes_gpu_resources_after_a_draw() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut state, &scene);
        destroy_gl_particle_emitter3d_shader(&state);
        assert!(count_calls("delete_program") > 0);
        assert!(count_calls("delete_buffers") >= 3);
    }
}

mod draw_gl_scene3d_particle_emitter3_ds {
    use super::*;

    #[test]
    fn is_a_no_op_when_scene_has_no_particle_emitter_3d_nodes() {
        let mut state = make_gl_scene3d_state();
        draw(&mut state, &make_test_scene());
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn skips_emitters_with_zero_particles() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &create_particle_emitter_3d());
        draw(&mut state, &scene);
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn issues_an_instanced_draw_for_particles() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(5));
        draw(&mut state, &scene);
        let draws = calls_with("draw_elements_instanced");
        assert!(!draws.is_empty());
        assert_eq!(draws[0].integers[4], 5);
    }

    #[test]
    fn applies_the_emitter_node_world_transform_for_local_space_particles() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let emitter = make_emitter_with_particles(1);
        {
            let mut guard = emitter.write().unwrap();
            guard.data.transforms[0] = 1.0;
            guard.data.transforms[1] = 2.0;
            guard.data.positions_z[0] = 3.0;
            set_vector3(&mut guard.node.position, 10.0, 20.0, 30.0);
        }
        let node: NodeRef = emitter.clone();
        invalidate_node_local_transform(&node);
        add_emitter(&scene, &emitter);
        draw(&mut state, &scene);
        let instance_data = first_instance_data();
        // Local particles ride the emitter node: local (1,2,3) + node translation (10,20,30).
        assert_close(instance_data[0], 11.0);
        assert_close(instance_data[1], 22.0);
        assert_close(instance_data[2], 33.0);
    }

    #[test]
    fn skips_the_node_world_transform_for_world_space_particles_already_baked_into_world_coordinates() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let emitter = make_emitter_with_particles(1);
        {
            let mut guard = emitter.write().unwrap();
            guard.data.transforms[0] = 1.0;
            guard.data.transforms[1] = 2.0;
            guard.data.positions_z[0] = 3.0;
            set_vector3(&mut guard.node.position, 10.0, 20.0, 30.0);
            guard.data.world_space = true;
        }
        let node: NodeRef = emitter.clone();
        invalidate_node_local_transform(&node);
        add_emitter(&scene, &emitter);
        draw(&mut state, &scene);
        let instance_data = first_instance_data();
        // World-space particles already hold world coordinates, so the node translation must NOT be
        // re-applied: the instance position stays at the baked (1,2,3).
        assert_close(instance_data[0], 1.0);
        assert_close(instance_data[1], 2.0);
        assert_close(instance_data[2], 3.0);
    }

    #[test]
    fn compiles_the_shader_program_on_first_call() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut state, &scene);
        assert!(count_calls("create_program") > 0);
    }

    #[test]
    fn reuses_the_shader_program_on_subsequent_calls() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut state, &scene);
        let program_count = count_calls("create_program");
        draw(&mut state, &scene);
        assert_eq!(count_calls("create_program"), program_count);
    }

    #[test]
    fn enables_depth_test_and_alpha_blending() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut state, &scene);
        let enables = calls_with("enable");
        assert!(enables.iter().any(|call| call.integers[0] == i64::from(glow::DEPTH_TEST)));
        assert!(enables.iter().any(|call| call.integers[0] == i64::from(glow::BLEND)));
        assert!(calls_with("depth_mask").iter().any(|call| call.integers[0] == 0));
    }

    #[test]
    fn applies_the_emitter_blend_mode_additive_for_add_premultiplied_over_blend_for_normal() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let additive = make_emitter_with_particles(1);
        additive.write().unwrap().blend_mode = Some("add".to_string());
        let normal = make_emitter_with_particles(1);
        add_emitter(&scene, &additive);
        add_emitter(&scene, &normal);
        draw(&mut state, &scene);
        let blend_funcs = calls_with("blend_func");
        let one = i64::from(glow::ONE);
        // add: straight ONE/ONE additive sum.
        assert!(blend_funcs.iter().any(|call| call.integers == vec![one, one]));
        // normal: premultiplied over-blend (ONE, ONE_MINUS_SRC_ALPHA), NOT SRC_ALPHA — the fragment
        // shader emits premultiplied color, so SRC_ALPHA would double-apply alpha and darken.
        assert!(
            blend_funcs
                .iter()
                .any(|call| call.integers == vec![one, i64::from(glow::ONE_MINUS_SRC_ALPHA)])
        );
        assert!(!blend_funcs.iter().any(|call| call.integers[0] == i64::from(glow::SRC_ALPHA)));
    }

    #[test]
    fn uploads_and_binds_the_atlas_image_never_a_null_texture_for_textured_particles() {
        let mut state = make_atlas_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_atlas_emitter(64.0, 32.0, TextureAtlasRotation::None));
        draw(&mut state, &scene);
        // The atlas image is uploaded to a GL texture on first use.
        assert!(count_calls("tex_image_2d") > 0);
        // Every texture bind targets a real texture object. Binding null here leaves an incomplete
        // sampler that reads (0,0,0,1), turning each particle into a solid black quad.
        let texture_binds = calls_with("bind_texture");
        assert!(!texture_binds.is_empty());
        assert!(texture_binds.iter().all(|call| call.integers[1] != 0));
        // u_hasTexture is signaled on so the fragment shader samples the atlas.
        assert!(has_texture_uniform(1));
    }

    #[test]
    fn uploads_atlas_pixels_with_straight_alpha_for_post_decode_shader_premultiplication() {
        let mut state = make_atlas_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_atlas_emitter(64.0, 32.0, TextureAtlasRotation::None));
        draw(&mut state, &scene);
        // Native GL has no UNPACK_PREMULTIPLY_ALPHA pixel-store flag; the realized upload records the
        // equivalent decision and the bytes themselves stay straight.
        assert!(!state.context_state.runtime_state.borrow().unpack_premultiply_alpha);
        let upload = calls_with("tex_image_2d").into_iter().last().expect("an atlas upload");
        assert_eq!(&upload.bytes[..4], &ATLAS_PIXEL);
    }

    #[test]
    fn premultiplies_sampled_atlas_color_after_decode_in_the_fragment_shader() {
        let mut state = make_atlas_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_atlas_emitter(64.0, 32.0, TextureAtlasRotation::None));
        draw(&mut state, &scene);
        let fragment_source = shader_sources()
            .into_iter()
            .find(|source| source.contains("out vec4 fragColor"))
            .expect("the particle fragment shader");
        assert!(fragment_source.contains("float alpha = tex.a * v_color.a;"));
        assert!(fragment_source.contains("vec4(tex.rgb * v_color.rgb * alpha, alpha)"));
    }

    #[test]
    fn normalizes_the_particle_quad_to_an_aspect_ratio_unit_square_not_the_region_pixel_size() {
        let mut state = make_atlas_gl_scene3d_state();
        let scene = make_test_scene();
        // A 64×32 region: the larger axis normalizes to 1, the shorter to its aspect ratio (0.5).
        add_emitter(&scene, &make_atlas_emitter(64.0, 32.0, TextureAtlasRotation::None));
        draw(&mut state, &scene);
        let instance_data = first_instance_data();
        // a_size occupies instance floats [13] (width) and [14] (height) of the first particle.
        assert_close(instance_data[13], 1.0);
        assert_close(instance_data[14], 0.5);
    }

    #[test]
    fn unrotates_a_packed_region_while_preserving_its_logical_billboard_aspect_ratio() {
        let mut state = make_atlas_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_atlas_emitter(32.0, 64.0, TextureAtlasRotation::Clockwise90));
        draw(&mut state, &scene);
        let instance_data = first_instance_data();
        assert_close(instance_data[13], -1.0);
        assert_close(instance_data[14], 0.5);
        let vertex_source = shader_sources()
            .into_iter()
            .find(|source| source.contains("u_cameraRight"))
            .expect("the particle vertex shader");
        assert!(vertex_source.contains("bool clockwise = a_size.x < 0.0;"));
    }

    #[test]
    fn uses_the_height_sign_bit_for_a_counterclockwise_packed_region() {
        let mut state = make_atlas_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(
            &scene,
            &make_atlas_emitter(32.0, 64.0, TextureAtlasRotation::Counterclockwise90),
        );
        draw(&mut state, &scene);
        let instance_data = first_instance_data();
        assert_close(instance_data[13], 1.0);
        assert_close(instance_data[14], -0.5);
    }

    #[test]
    fn does_not_upload_a_texture_and_signals_u_has_texture_off_for_atlas_less_emitters() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut state, &scene);
        assert_eq!(count_calls("tex_image_2d"), 0);
        assert!(has_texture_uniform(0));
    }

    #[test]
    fn restores_depth_write_and_disables_blend_after_draw() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut state, &scene);
        let depth_mask_calls = calls_with("depth_mask");
        assert_eq!(depth_mask_calls.last().unwrap().integers[0], 1);
        assert!(
            calls_with("disable")
                .iter()
                .any(|call| call.integers[0] == i64::from(glow::BLEND))
        );
    }

    #[test]
    fn uploads_view_projection_and_camera_vectors_as_uniforms() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut state, &scene);
        assert!(count_calls("uniform_matrix_4_f32") > 0);
        assert!(count_calls("uniform_3_f32") >= 2);
    }

    #[test]
    fn draws_multiple_emitters_in_one_call() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_emitter(&scene, &make_emitter_with_particles(3));
        add_emitter(&scene, &make_emitter_with_particles(7));
        draw(&mut state, &scene);
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 2);
        assert_eq!(draws[0].integers[4], 3);
        assert_eq!(draws[1].integers[4], 7);
    }

    #[test]
    fn skips_disabled_emitters() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let emitter = make_emitter_with_particles(5);
        emitter.write().unwrap().node_fields_mut().enabled = false;
        add_emitter(&scene, &emitter);
        draw(&mut state, &scene);
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }
}

mod register_gl_particle_emitter3d_pass {
    use super::*;

    fn is_particle_pass(pass: &GlScene3DPass) -> bool {
        let expected: GlScene3DPass = draw_gl_scene3d_particle_emitter3_ds;
        return std::ptr::fn_addr_eq(*pass, expected);
    }

    #[test]
    fn appends_the_emitter_draw_to_the_pass_list_render_gl_scene3d_dispatches() {
        let mut state = make_gl_scene3d_state();
        register_gl_particle_emitter3d_pass(&mut state);
        let passes = pass_list(&state).expect("a pass list");
        assert_eq!(passes.len(), 1);
        assert!(is_particle_pass(&passes[0]));
    }

    #[test]
    fn registers_no_pass_list_until_it_is_called_so_the_pass_shakes_out_when_unused() {
        let state = make_gl_scene3d_state();
        assert!(pass_list(&state).is_none());
    }

    #[test]
    fn is_idempotent_so_a_repeated_setup_cannot_draw_the_emitters_twice() {
        let mut state = make_gl_scene3d_state();
        register_gl_particle_emitter3d_pass(&mut state);
        register_gl_particle_emitter3d_pass(&mut state);
        assert_eq!(pass_list(&state).unwrap().len(), 1);
    }
}
