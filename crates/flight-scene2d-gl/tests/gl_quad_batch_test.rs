use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_node::NodeRef;
use flight_quadbatch::{QuadTransformType, create_quad_batch};
use flight_render::RenderProxy2D;
use flight_render_gl::{GlColorAdjustmentData, GlRenderState, register_gl_image_texture_resolver};
use flight_scene2d_gl::contract::*;
use flight_textureatlas::{TextureAtlas, TextureAtlasRotation, create_texture_atlas};

use crate::gl_test_helper::{
    calls_with, count_calls, create_gl_state, make_atlas, make_color_scale_bias, make_ct,
    make_scene2d_proxy, make_tint_material_data,
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

fn set_per_quad_material_data(
    node: &NodeRef,
    entries: Vec<Option<Ref<dyn flight_materials::MaterialData>>>,
) {
    let mut guard = node.write().unwrap();
    let quad_batch = guard
        .as_any_mut()
        .downcast_mut::<flight_quadbatch::QuadBatch>()
        .unwrap();
    quad_batch.data.material_data = Some(entries);
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

    // Per-quad material data holds ColorScaleBias values through the shared MaterialData alias (TS
    // `QuadBatch.materialData: (MaterialData | null)[]`, read as `ColorScaleBias | TintMaterialData`).
    #[test]
    fn takes_a_per_quad_color_scale_bias_entry_as_that_quads_color_adjustment() {
        let mut state = create_atlas_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let node = default_node();
        set_per_quad_material_data(&node, vec![Some(Arc::new(RwLock::new(make_ct(0.5))))]);
        let proxy = make_scene2d_proxy(&mut state, node);
        (GL_QUAD_BATCH_RENDERER.submit)(&mut state, &proxy);
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_uniform_color_scale_bias,
            Some(GlColorAdjustmentData::ColorScaleBias([
                0.5, 0.5, 0.5, 1.0, 0.0, 0.0, 0.0, 0.0
            ]))
        );
    }

    #[test]
    fn still_takes_a_per_quad_tint_entry_as_a_packed_tint() {
        let mut state = create_atlas_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let node = default_node();
        set_per_quad_material_data(
            &node,
            vec![Some(Arc::new(RwLock::new(make_tint_material_data(
                0x80ffffff,
            ))))],
        );
        let proxy = make_scene2d_proxy(&mut state, node);
        (GL_QUAD_BATCH_RENDERER.submit)(&mut state, &proxy);
        assert_eq!(
            state
                .gl_runtime
                .borrow()
                .quad_batch_writer_uniform_color_scale_bias,
            Some(GlColorAdjustmentData::TintMaterialData(0x80ffffff))
        );
    }

    #[test]
    fn mixes_per_quad_color_scale_bias_and_untinted_quads_per_instance() {
        let mut state = create_atlas_gl_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let node = make_quad_batch_node(
            Some(make_atlas(32.0, 32.0)),
            2,
            vec![0, 0],
            vec![0.0, 0.0, 10.0, 0.0],
            QuadTransformType::Vector2,
        );
        // A nonzero bias keeps the scale/bias form (a pure scale would pack to a tint).
        let entry = make_color_scale_bias(0.25, 0.25, 0.25, 1.0, 0.1, 0.0, 0.0, 0.0);
        set_per_quad_material_data(&node, vec![None, Some(Arc::new(RwLock::new(entry)))]);
        let proxy = make_scene2d_proxy(&mut state, node);
        (GL_QUAD_BATCH_RENDERER.submit)(&mut state, &proxy);
        let runtime = state.gl_runtime.borrow();
        let data = runtime
            .quad_batch_writer_color_scale_bias_data
            .as_ref()
            .unwrap();
        // Instance 0 untinted (identity), instance 1 the per-quad scale.
        assert_eq!(&data[0..8], &[1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0]);
        assert_eq!(&data[8..16], &[0.25, 0.25, 0.25, 1.0, 0.1, 0.0, 0.0, 0.0]);
    }
}
