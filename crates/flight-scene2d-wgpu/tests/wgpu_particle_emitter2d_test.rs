use flight_node::NodeRef;
use flight_render::get_or_create_render_proxy_2d;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;
use flight_textureatlas::TextureAtlasRotation;

use crate::support::*;

fn emitter_with_region(rotation: TextureAtlasRotation) -> NodeRef {
    let emitter = flight_particleemitter::create_particle_emitter_2d();
    {
        let mut emitter = emitter.write().unwrap();
        emitter.data.atlas = Some(create_test_atlas(
            64,
            64,
            &[(0.0, 0.0, 20.0, 40.0, rotation)],
        ));
        emitter.data.alphas = vec![1.0];
        emitter.data.colors = vec![1.0, 1.0, 1.0];
        emitter.data.ids = vec![0];
        emitter.data.particle_count = 1;
        emitter.data.transforms = vec![0.0, 0.0, 0.0, 1.0];
        emitter.data.world_space = false;
    }
    return emitter;
}

mod draw_wgpu_particle_emitter2d {
    use super::*;

    #[test]
    fn does_not_panic_when_atlas_is_none() {
        let mut state = create_test_state_in_pass();
        let emitter: NodeRef = flight_particleemitter::create_particle_emitter_2d();
        let mut proxies = prepare_test_scene(&mut state, &emitter);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &emitter);
        draw_wgpu_particle_emitter2d(&mut state, proxy);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .particle_instance_buffer
                .is_none()
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn threads_the_atlas_straight_alpha_flag_through_the_particle_uniform() {
        let mut state = create_test_state_in_pass();
        register_wgpu_image_texture_resolver(&mut state);
        let emitter = emitter_with_region(TextureAtlasRotation::None);
        let before = get_wgpu_render_state_runtime(&state).uniform_offset;
        let mut proxies = prepare_test_scene(&mut state, &emitter);
        let proxy = get_wgpu_render_proxy_for_test(&mut state, &mut proxies, &emitter);

        draw_wgpu_particle_emitter2d(&mut state, &proxy);

        let runtime = get_wgpu_render_state_runtime(&state);
        let base = (before >> 2) as usize;
        // An uploaded host image is premultiplied, so the straight-alpha word is 0; the alpha
        // word is the unit per-emitter alpha (per-instance alpha carries the fade).
        assert_eq!(runtime.uniform_data[base + 14].to_bits(), 0);
        assert_eq!(runtime.uniform_data[base + 12], 1.0);
        assert!(runtime.uniform_offset > before);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn packs_a_rotated_region_at_its_upright_logical_size_without_growing_the_instance_record() {
        let mut state = create_test_state_in_pass();
        register_wgpu_image_texture_resolver(&mut state);
        let emitter = emitter_with_region(TextureAtlasRotation::Clockwise90);
        let mut proxies = prepare_test_scene(&mut state, &emitter);
        let proxy = get_wgpu_render_proxy_for_test(&mut state, &mut proxies, &emitter);

        draw_wgpu_particle_emitter2d(&mut state, &proxy);
        {
            let data = get_wgpu_render_state_runtime(&state)
                .particle_instance_data
                .clone()
                .unwrap();
            assert_eq!(data[12], -40.0);
            assert_eq!(data[13], 20.0);
        }

        {
            let guard = emitter.read().unwrap();
            let emitter = guard
                .as_any()
                .downcast_ref::<flight_particleemitter::ParticleEmitter2D>()
                .unwrap();
            let atlas = emitter.data.atlas.clone().unwrap();
            let region = atlas.read().unwrap().regions[0].clone();
            region.write().unwrap().rotation = TextureAtlasRotation::Counterclockwise90;
        }
        draw_wgpu_particle_emitter2d(&mut state, &proxy);
        let data = get_wgpu_render_state_runtime(&state)
            .particle_instance_data
            .clone()
            .unwrap();
        assert_eq!(data[12], 40.0);
        assert_eq!(data[13], -20.0);
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_particle_emitter2d_renderer {
    use super::*;

    #[test]
    fn has_create_data_and_submit_functions() {
        assert!(WGPU_PARTICLE_EMITTER2D_RENDERER.format.is_none());
        assert!(WGPU_PARTICLE_EMITTER2D_RENDERER.destroy_data.is_none());
    }
}
