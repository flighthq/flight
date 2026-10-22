use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_node::NodeRef;
use flight_particleemitter::create_particle_emitter_2d;
use flight_render_gl::{GlRenderState, register_gl_image_texture_resolver};
use flight_scene2d_gl::*;
use flight_textureatlas::{TextureAtlas, TextureAtlasRotation, create_texture_atlas};

use crate::gl_test_helper::{calls_with, count_calls, create_gl_state, make_atlas, make_scene2d_proxy};

fn make_rotated_atlas(rotation: TextureAtlasRotation) -> Ref<TextureAtlas> {
    let (width, height) = if rotation == TextureAtlasRotation::None {
        (32.0, 32.0)
    } else {
        (20.0, 40.0)
    };
    let atlas = make_atlas(width, height);
    atlas.read().unwrap().regions[0].write().unwrap().rotation = rotation;
    return atlas;
}

fn create_atlas_gl_state() -> GlRenderState {
    let mut state = create_gl_state();
    register_gl_image_texture_resolver(&mut state);
    return state;
}

fn make_particle_emitter2d_node(
    atlas: Option<Ref<TextureAtlas>>,
    particle_count: usize,
    ids: Vec<u16>,
    transforms: Vec<f32>,
    alphas: Vec<f32>,
    colors: Vec<f32>,
) -> NodeRef {
    let emitter = create_particle_emitter_2d();
    {
        let mut emitter = emitter.write().unwrap();
        emitter.data.atlas = atlas;
        emitter.data.particle_count = particle_count;
        emitter.data.ids = ids;
        emitter.data.transforms = transforms;
        emitter.data.alphas = alphas;
        emitter.data.colors = colors;
    }
    return emitter;
}

fn default_node(atlas: Option<Ref<TextureAtlas>>, particle_count: usize) -> NodeRef {
    return make_particle_emitter2d_node(
        atlas,
        particle_count,
        vec![0],
        vec![0.0, 0.0, 0.0, 1.0],
        vec![1.0],
        vec![1.0, 1.0, 1.0],
    );
}

fn draw(state: &mut GlRenderState, node: NodeRef) {
    let proxy = make_scene2d_proxy(state, node);
    draw_gl_particle_emitter2d(state, &proxy);
}

mod draw_gl_particle_emitter2d {
    use super::*;

    #[test]
    fn returns_early_without_drawing_when_atlas_is_null() {
        let mut state = create_atlas_gl_state();
        draw(&mut state, default_node(None, 1));
        assert_eq!(count_calls("draw_elements"), 0);
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_texture_is_null() {
        let mut state = create_atlas_gl_state();
        draw(&mut state, default_node(Some(create_texture_atlas()), 1));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_texture_is_unbound() {
        let mut state = create_atlas_gl_state();
        let atlas = create_texture_atlas();
        atlas.write().unwrap().texture =
            Some(Arc::new(RwLock::new(flight_texture::create_texture_2d())));
        draw(&mut state, default_node(Some(atlas), 1));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_particle_count_is_0() {
        let mut state = create_atlas_gl_state();
        draw(&mut state, default_node(Some(make_rotated_atlas(TextureAtlasRotation::None)), 0));
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn draws_all_live_particles_in_a_single_instanced_draw_call() {
        let mut state = create_atlas_gl_state();
        draw(
            &mut state,
            make_particle_emitter2d_node(
                Some(make_rotated_atlas(TextureAtlasRotation::None)),
                3,
                vec![0, 0, 0],
                vec![0.0, 0.0, 0.0, 1.0, 10.0, 10.0, 0.0, 1.0, 20.0, 20.0, 0.0, 1.0],
                vec![1.0, 0.5, 0.25],
                vec![1.0; 9],
            ),
        );
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[1], 6);
        assert_eq!(draws[0].integers[4], 3);
    }

    #[test]
    fn skips_out_of_range_region_ids_and_draws_only_valid_particles() {
        let mut state = create_atlas_gl_state();
        draw(
            &mut state,
            make_particle_emitter2d_node(
                Some(make_rotated_atlas(TextureAtlasRotation::None)),
                3,
                vec![0, 99, 0],
                vec![0.0, 0.0, 0.0, 1.0, 10.0, 10.0, 0.0, 1.0, 20.0, 20.0, 0.0, 1.0],
                vec![1.0; 3],
                vec![1.0; 9],
            ),
        );
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 2);
    }

    #[test]
    fn packs_a_rotated_region_at_its_upright_logical_size_without_growing_the_instance_record() {
        let mut state = create_atlas_gl_state();
        draw(
            &mut state,
            default_node(Some(make_rotated_atlas(TextureAtlasRotation::Clockwise90)), 1),
        );
        let runtime = state.gl_runtime.borrow();
        let data = runtime.particle_instance_data.as_ref().unwrap();
        assert_eq!(data[12], -40.0);
        assert_eq!(data[13], 20.0);
    }

    #[test]
    fn uses_the_existing_height_sign_bit_for_a_counterclockwise_packed_region() {
        let mut state = create_atlas_gl_state();
        draw(
            &mut state,
            default_node(
                Some(make_rotated_atlas(TextureAtlasRotation::Counterclockwise90)),
                1,
            ),
        );
        let runtime = state.gl_runtime.borrow();
        let data = runtime.particle_instance_data.as_ref().unwrap();
        assert_eq!(data[12], 40.0);
        assert_eq!(data[13], -20.0);
    }
}

mod gl_particle_emitter2d_renderer {
    use super::*;

    #[test]
    fn has_a_create_data_function() {
        let mut state = create_gl_state();
        assert!((GL_PARTICLE_EMITTER2D_RENDERER.create_data)(&mut state, &default_node(None, 1)).is_none());
    }

    #[test]
    fn has_a_submit_function() {
        let mut state = create_atlas_gl_state();
        let proxy = make_scene2d_proxy(
            &mut state,
            default_node(Some(make_rotated_atlas(TextureAtlasRotation::None)), 1),
        );
        (GL_PARTICLE_EMITTER2D_RENDERER.submit)(&mut state, &proxy);
        assert_eq!(count_calls("draw_elements_instanced"), 1);
    }
}
