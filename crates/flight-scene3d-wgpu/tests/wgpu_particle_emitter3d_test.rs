use flight_entity::Ref;
use flight_node::{NodeRef, add_node_child, invalidate_node_local_transform};
use flight_particleemitter::{ParticleEmitter3D, create_particle_emitter_3d, reserve_particle_emitter_3d};
use flight_render_wgpu::*;
use flight_scene3d::{Node3DFields, create_node3d, publish_node3d};
use flight_scene3d_wgpu::contract::*;
use flight_textureatlas::{TextureAtlasRotation, create_texture_atlas, create_texture_atlas_region};

use crate::support::*;

fn make_camera() -> flight_camera::Camera3D {
    let camera = make_test_camera();
    camera.view.write().unwrap().m = flight_geometry::create_matrix4().m;
    return camera;
}

fn make_lights() -> flight_lighting::Scene3DLightsLike {
    return test_default();
}

fn make_scene() -> NodeRef {
    return publish_node3d(create_node3d::<Node3DFields>(None));
}

fn add_emitter(scene: &NodeRef, emitter: &Ref<ParticleEmitter3D>) {
    let child: NodeRef = emitter.clone();
    add_node_child(scene, &child);
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

fn make_atlas_emitter(
    region_width: f32,
    region_height: f32,
    rotation: TextureAtlasRotation,
) -> (Ref<ParticleEmitter3D>, std::sync::Arc<TestImageSource>) {
    let emitter = make_emitter_with_particles(1);
    let (image, fake) = create_test_image_resource(128, 128);
    let region = create_texture_atlas_region();
    {
        let mut region = region.write().unwrap();
        region.id = 0;
        region.rotation = rotation;
        region.x = 0.0;
        region.y = 0.0;
        region.width = region_width;
        region.height = region_height;
    }
    let mut texture = flight_texture::create_texture_2d();
    texture.source = Some(image);
    let atlas = create_texture_atlas();
    {
        let mut atlas = atlas.write().unwrap();
        atlas.regions = vec![region];
        atlas.texture = Some(std::sync::Arc::new(std::sync::RwLock::new(texture)));
    }
    emitter.write().unwrap().data.atlas = Some(atlas);
    return (emitter, fake);
}

fn make_atlas_state() -> WgpuScene3DTestState {
    let mut test = make_wgpu_scene3d_state(None);
    register_wgpu_image_texture_resolver(&mut test.state);
    return test;
}

// The instance upload is the buffer write longer than the 8-float corner quad and the 24-float frame.
fn find_instance_write(test: &WgpuScene3DTestState) -> Option<Vec<f32>> {
    return test
        .buffer_writes()
        .into_iter()
        .map(|write| bytes_to_f32(&write.data))
        .find(|values| values.len() % 16 == 0 && values.len() != 24 && values.len() >= 16 && values.len() != 32);
}

fn has_texture_constant(descriptor: &WgpuRenderPipelineDescriptorRecord) -> f64 {
    return descriptor
        .fragment_constants
        .iter()
        .find(|(name, _)| name == "HAS_TEXTURE")
        .map_or(-1.0, |(_, value)| *value);
}

fn draw(test: &mut WgpuScene3DTestState, scene: &NodeRef) {
    draw_wgpu_scene3d_particle_emitter3_ds(&mut test.state, scene, &make_camera(), &make_lights());
}

mod destroy_wgpu_particle_emitter3d_resources {
    use super::*;

    #[test]
    fn is_a_no_op_when_no_resources_were_created() {
        let mut test = make_wgpu_scene3d_state(None);
        destroy_wgpu_particle_emitter3d_resources(&mut test.state);
        assert!(get_wgpu_scene3d_runtime(&mut test.state).particle_resources.is_none());
    }

    #[test]
    fn drops_resources_after_a_draw() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut test, &scene);
        assert!(get_wgpu_scene3d_runtime(&mut test.state).particle_resources.is_some());
        destroy_wgpu_particle_emitter3d_resources(&mut test.state);
        assert!(get_wgpu_scene3d_runtime(&mut test.state).particle_resources.is_none());
    }
}

mod draw_wgpu_scene3d_particle_emitter3_ds {
    use super::*;

    #[test]
    fn is_a_no_op_when_the_scene_has_no_particle_emitter_nodes() {
        let mut test = make_wgpu_scene3d_state(None);
        draw(&mut test, &make_scene());
        assert_eq!(test.count("drawIndexed"), 0);
    }

    #[test]
    fn skips_emitters_with_zero_particles() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        add_emitter(&scene, &create_particle_emitter_3d());
        draw(&mut test, &scene);
        assert_eq!(test.count("drawIndexed"), 0);
    }

    #[test]
    fn issues_one_instanced_indexed_draw_of_6_indices_per_emitter() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        add_emitter(&scene, &make_emitter_with_particles(5));
        draw(&mut test, &scene);
        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, 6);
        assert_eq!(draws[0].instance_count, 5);
    }

    #[test]
    fn uploads_the_per_instance_data_to_a_vertex_buffer() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        add_emitter(&scene, &make_emitter_with_particles(3));
        draw(&mut test, &scene);
        assert_eq!(find_instance_write(&test).unwrap().len(), 48);
    }

    #[test]
    fn normalizes_the_particle_quad_to_an_aspect_ratio_unit_square_not_the_region_pixel_size() {
        let mut test = make_atlas_state();
        let scene = make_scene();
        let (emitter, _fake) = make_atlas_emitter(64.0, 32.0, TextureAtlasRotation::None);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        let instance = find_instance_write(&test).unwrap();
        assert!((instance[13] - 1.0).abs() < 1e-6);
        assert!((instance[14] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn unrotates_a_packed_region_while_preserving_its_logical_billboard_aspect_ratio() {
        let mut test = make_atlas_state();
        let scene = make_scene();
        let (emitter, _fake) = make_atlas_emitter(32.0, 64.0, TextureAtlasRotation::Clockwise90);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        let instance = find_instance_write(&test).unwrap();
        assert!((instance[13] + 1.0).abs() < 1e-6);
        assert!((instance[14] - 0.5).abs() < 1e-6);
        let shader = test
            .shader_sources()
            .into_iter()
            .find(|source| source.contains("@vertex fn vs_main"))
            .unwrap();
        assert!(shader.contains("let clockwise = size.x < 0.0;"));
    }

    #[test]
    fn uses_the_height_sign_bit_for_a_counterclockwise_packed_region() {
        let mut test = make_atlas_state();
        let scene = make_scene();
        let (emitter, _fake) =
            make_atlas_emitter(32.0, 64.0, TextureAtlasRotation::Counterclockwise90);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        let instance = find_instance_write(&test).unwrap();
        assert!((instance[13] - 1.0).abs() < 1e-6);
        assert!((instance[14] + 0.5).abs() < 1e-6);
    }

    #[test]
    fn compiles_the_textured_pipeline_variant_for_an_atlas_emitter() {
        let mut test = make_atlas_state();
        let scene = make_scene();
        let (emitter, _fake) = make_atlas_emitter(64.0, 64.0, TextureAtlasRotation::None);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        assert!(test
            .pipelines()
            .iter()
            .any(|descriptor| has_texture_constant(descriptor) == 1.0));
    }

    #[test]
    fn copies_atlas_pixels_with_straight_alpha_for_post_decode_shader_premultiplication() {
        let mut test = make_atlas_state();
        let scene = make_scene();
        let (emitter, fake) = make_atlas_emitter(64.0, 64.0, TextureAtlasRotation::None);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        let copies = fake.copies.lock().unwrap();
        assert!(!copies.is_empty());
        assert!(!copies[0].premultiplied_alpha);
    }

    #[test]
    fn premultiplies_sampled_atlas_color_after_decode_in_the_fragment_shader() {
        let mut test = make_atlas_state();
        let scene = make_scene();
        let (emitter, _fake) = make_atlas_emitter(64.0, 64.0, TextureAtlasRotation::None);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        let shader = test
            .shader_sources()
            .into_iter()
            .find(|source| source.contains("@fragment fn fs_main"))
            .unwrap();
        assert!(shader.contains("let alpha = tex.a * in.color.a;"));
        assert!(shader.contains("vec4f(tex.rgb * in.color.rgb * alpha, alpha)"));
    }

    #[test]
    fn compiles_the_untextured_pipeline_variant_for_an_atlas_less_emitter() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut test, &scene);
        let descriptors = test.pipelines();
        assert_eq!(descriptors.len(), 1);
        assert_eq!(has_texture_constant(&descriptors[0]), 0.0);
    }

    #[test]
    fn reuses_the_cached_pipeline_on_a_second_draw() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        add_emitter(&scene, &make_emitter_with_particles(1));
        draw(&mut test, &scene);
        draw(&mut test, &scene);
        assert_eq!(test.pipelines().len(), 1);
    }

    #[test]
    fn skips_the_node_world_transform_for_world_space_particles() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        let emitter = make_emitter_with_particles(1);
        {
            let mut guard = emitter.write().unwrap();
            guard.data.transforms[0] = 1.0;
            guard.data.transforms[1] = 2.0;
            guard.data.positions_z[0] = 3.0;
            guard.node.position = flight_geometry::create_vector3(10.0, 20.0, 30.0);
            guard.data.world_space = true;
        }
        let node: NodeRef = emitter.clone();
        invalidate_node_local_transform(&node);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        let instance = find_instance_write(&test).unwrap();
        assert!((instance[0] - 1.0).abs() < 1e-5);
        assert!((instance[1] - 2.0).abs() < 1e-5);
        assert!((instance[2] - 3.0).abs() < 1e-5);
    }

    #[test]
    fn applies_the_node_world_transform_for_local_space_particles() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = make_scene();
        let emitter = make_emitter_with_particles(1);
        {
            let mut guard = emitter.write().unwrap();
            guard.data.transforms[0] = 1.0;
            guard.data.transforms[1] = 2.0;
            guard.data.positions_z[0] = 3.0;
            guard.node.position = flight_geometry::create_vector3(10.0, 20.0, 30.0);
        }
        let node: NodeRef = emitter.clone();
        invalidate_node_local_transform(&node);
        add_emitter(&scene, &emitter);
        draw(&mut test, &scene);
        let instance = find_instance_write(&test).unwrap();
        assert!((instance[0] - 11.0).abs() < 1e-5);
        assert!((instance[1] - 22.0).abs() < 1e-5);
        assert!((instance[2] - 33.0).abs() < 1e-5);
    }
}

mod register_wgpu_particle_emitter3d_pass {
    use super::*;

    fn passes(test: &WgpuScene3DTestState) -> Option<Vec<WgpuScene3DPass>> {
        return get_wgpu_render_state_runtime(&test.state)
            .registries
            .passes
            .as_ref()
            .map(|passes| (**passes).clone());
    }

    #[test]
    fn appends_the_emitter_draw_to_the_pass_list_render_wgpu_scene3d_dispatches() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_particle_emitter3d_pass(&mut test.state);
        let passes = passes(&test).unwrap();
        assert_eq!(passes.len(), 1);
        let expected: WgpuScene3DPass = draw_wgpu_scene3d_particle_emitter3_ds;
        assert!(std::ptr::fn_addr_eq(passes[0], expected));
    }

    #[test]
    fn registers_no_pass_list_until_it_is_called_so_the_pass_shakes_out_when_unused() {
        let test = make_wgpu_scene3d_state(None);
        assert!(passes(&test).is_none());
    }

    #[test]
    fn is_idempotent_so_a_repeated_setup_cannot_draw_the_emitters_twice() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_particle_emitter3d_pass(&mut test.state);
        register_wgpu_particle_emitter3d_pass(&mut test.state);
        assert_eq!(passes(&test).unwrap().len(), 1);
    }
}
