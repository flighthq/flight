use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_node::NodeRef;
use flight_quadbatch::{QuadTransformType, create_quad_batch};
use flight_render::RenderProxy2D;
use flight_render_gl::{GlRenderState, register_gl_image_texture_resolver};
use flight_scene2d_gl::*;
use flight_textureatlas::{TextureAtlas, TextureAtlasRotation, create_texture_atlas};

use crate::gl_test_helper::{
    calls_with, count_calls, create_gl_state, make_atlas, make_scene2d_proxy,
};

fn create_atlas_gl_state() -> GlRenderState {
    let mut state = create_gl_state();
    register_gl_image_texture_resolver(&mut state);
    register_gl_standard_material(&mut state);
    return state;
}

fn make_quad_batch_node(
    atlas: Option<Ref<TextureAtlas>>,
    instance_count: usize,
    ids: Vec<u16>,
    transforms: Vec<f32>,
    transform_type: QuadTransformType,
) -> NodeRef {
    let quad_batch = create_quad_batch();
    {
        let mut quad_batch = quad_batch.write().unwrap();
        quad_batch.data.atlas = atlas;
        quad_batch.data.instance_count = instance_count;
        quad_batch.data.ids = ids;
        quad_batch.data.transforms = transforms;
        quad_batch.data.transform_type = transform_type;
    }
    return quad_batch;
}

fn default_node() -> NodeRef {
    return make_quad_batch_node(
        Some(make_atlas(32.0, 32.0)),
        1,
        vec![0],
        vec![0.0, 0.0],
        QuadTransformType::Vector2,
    );
}

fn submit(state: &mut GlRenderState, node: NodeRef) {
    let proxy: RenderProxy2D<GlRenderState> = make_scene2d_proxy(state, node);
    (GL_QUAD_BATCH_RENDERER.submit)(state, &proxy);
    flush_gl_quad_batch_writer(state);
}

fn close(actual: f32, expected: f32) -> bool {
    // D1 f32 bound (TS: toBeCloseTo 2 digits)
    return (actual - expected).abs() <= 0.005;
}

mod gl_quad_batch_renderer {
    use super::*;

    #[test]
    fn has_a_submit_function() {
        let submit: fn(&mut GlRenderState, &flight_render::RenderProxy2D<GlRenderState>) =
            GL_QUAD_BATCH_RENDERER.submit;
        let _ = submit;
    }

    #[test]
    fn has_a_create_data_function() {
        let mut state = create_gl_state();
        assert!((GL_QUAD_BATCH_RENDERER.create_data)(&mut state, &default_node()).is_none());
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_is_null() {
        let mut state = create_atlas_gl_state();
        submit(
            &mut state,
            make_quad_batch_node(None, 1, vec![0], vec![0.0, 0.0], QuadTransformType::Vector2),
        );
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_texture_is_null() {
        let mut state = create_atlas_gl_state();
        submit(
            &mut state,
            make_quad_batch_node(
                Some(create_texture_atlas()),
                1,
                vec![0],
                vec![0.0, 0.0],
                QuadTransformType::Vector2,
            ),
        );
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_atlas_texture_is_unbound() {
        let mut state = create_atlas_gl_state();
        let atlas = create_texture_atlas();
        atlas.write().unwrap().texture =
            Some(Arc::new(RwLock::new(flight_texture::create_texture_2d())));
        submit(
            &mut state,
            make_quad_batch_node(
                Some(atlas),
                1,
                vec![0],
                vec![0.0, 0.0],
                QuadTransformType::Vector2,
            ),
        );
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn returns_early_without_drawing_when_instance_count_is_0() {
        let mut state = create_atlas_gl_state();
        submit(
            &mut state,
            make_quad_batch_node(
                Some(make_atlas(32.0, 32.0)),
                0,
                vec![0],
                vec![0.0, 0.0],
                QuadTransformType::Vector2,
            ),
        );
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn draws_all_valid_instances_in_a_single_instanced_call_with_vector2_transform_type() {
        let mut state = create_atlas_gl_state();
        submit(
            &mut state,
            make_quad_batch_node(
                Some(make_atlas(32.0, 32.0)),
                2,
                vec![0, 0],
                vec![0.0, 0.0, 10.0, 20.0],
                QuadTransformType::Vector2,
            ),
        );
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 2);
    }

    #[test]
    fn packs_a_rotated_region_with_upright_geometry_and_affine_uv_axes() {
        let mut state = create_atlas_gl_state();
        let atlas = make_atlas(20.0, 40.0);
        atlas.read().unwrap().regions[0].write().unwrap().rotation =
            TextureAtlasRotation::Clockwise90;
        let proxy = make_scene2d_proxy(
            &mut state,
            make_quad_batch_node(
                Some(atlas),
                1,
                vec![0],
                vec![0.0, 0.0],
                QuadTransformType::Vector2,
            ),
        );

        (GL_QUAD_BATCH_RENDERER.submit)(&mut state, &proxy);

        let data = state
            .gl_runtime
            .borrow()
            .quad_batch_writer_instance_data
            .clone();
        assert!(close(data[0], 40.0));
        assert!(close(data[3], 20.0));
        assert!(close(data[6], 20.0 / 64.0));
        assert!(close(data[7], 0.0));
        assert!(close(data[8], 0.0));
        assert!(close(data[9], 40.0 / 64.0));
        assert!(close(data[10], -20.0 / 64.0));
        assert!(close(data[11], 0.0));
    }

    #[test]
    fn packs_libgdx_counterclockwise_regions_with_the_opposite_affine_uv_axes() {
        let mut state = create_atlas_gl_state();
        let atlas = make_atlas(20.0, 40.0);
        atlas.read().unwrap().regions[0].write().unwrap().rotation =
            TextureAtlasRotation::Counterclockwise90;
        let proxy = make_scene2d_proxy(
            &mut state,
            make_quad_batch_node(
                Some(atlas),
                1,
                vec![0],
                vec![0.0, 0.0],
                QuadTransformType::Vector2,
            ),
        );

        (GL_QUAD_BATCH_RENDERER.submit)(&mut state, &proxy);

        let data = state
            .gl_runtime
            .borrow()
            .quad_batch_writer_instance_data
            .clone();
        assert!(close(data[6], 0.0));
        assert!(close(data[7], 40.0 / 64.0));
        assert!(close(data[9], -40.0 / 64.0));
        assert!(close(data[10], 20.0 / 64.0));
    }

    #[test]
    fn excludes_out_of_range_ids_from_the_instanced_draw_count() {
        let mut state = create_atlas_gl_state();
        submit(
            &mut state,
            make_quad_batch_node(
                Some(make_atlas(32.0, 32.0)),
                3,
                vec![0, 99, 0],
                vec![0.0; 6],
                QuadTransformType::Vector2,
            ),
        );
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 2);
    }

    #[test]
    fn draws_all_valid_instances_in_a_single_instanced_call_with_full_matrix_transform_type() {
        let mut state = create_atlas_gl_state();
        submit(
            &mut state,
            make_quad_batch_node(
                Some(make_atlas(32.0, 32.0)),
                1,
                vec![0],
                vec![1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                QuadTransformType::Matrix3x2,
            ),
        );
        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 1);
    }
}
