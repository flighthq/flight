use flight_node::NodeRef;
use flight_render::{BatchFormat, get_or_create_render_proxy_2d};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;
use flight_textureatlas::TextureAtlasRotation;

use crate::support::*;

fn rotated_batch(rotation: TextureAtlasRotation) -> NodeRef {
    let batch = flight_quadbatch::create_quad_batch();
    {
        let mut batch = batch.write().unwrap();
        batch.data.atlas = Some(create_test_atlas(
            64,
            64,
            &[(0.0, 0.0, 20.0, 40.0, rotation)],
        ));
        flight_quadbatch::reserve_quad_batch(&mut batch, 1);
        batch.data.instance_count = 1;
        batch.data.ids[0] = 0;
    }
    return batch;
}

fn close(a: f32, b: f32) -> bool {
    return (a - b).abs() < 1e-5;
}

mod wgpu_quad_batch_renderer {
    use super::*;

    #[test]
    fn has_create_data_and_submit_functions() {
        assert_eq!(WGPU_QUAD_BATCH_RENDERER.format, Some(BatchFormat::Quad));
        assert!(WGPU_QUAD_BATCH_RENDERER.destroy_data.is_none());
    }

    #[test]
    fn submit_does_not_panic_when_atlas_is_none() {
        let mut state = create_test_state_in_pass();
        let batch: NodeRef = flight_quadbatch::create_quad_batch();
        let mut proxies = prepare_test_scene(&mut state, &batch);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &batch);
        (WGPU_QUAD_BATCH_RENDERER.submit)(&mut state, proxy);
        flush_wgpu_quad_batch_writer(&mut state);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_count,
            0
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn submit_packs_a_rotated_region_with_upright_geometry_and_affine_uv_axes() {
        let mut state = create_test_state_in_pass();
        register_wgpu_image_texture_resolver(&mut state);
        register_wgpu_standard_material(&mut state);
        let batch = rotated_batch(TextureAtlasRotation::Clockwise90);
        let mut proxies = prepare_test_scene(&mut state, &batch);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &batch);

        (WGPU_QUAD_BATCH_RENDERER.submit)(&mut state, proxy);

        let data = &get_wgpu_render_state_runtime(&state).quad_batch_writer_instance_data;
        assert!(close(data[0], 40.0));
        assert!(close(data[3], 20.0));
        assert!(close(data[6], 20.0 / 64.0));
        assert!(close(data[7], 0.0));
        assert!(close(data[8], 0.0));
        assert!(close(data[9], 40.0 / 64.0));
        assert!(close(data[10], -20.0 / 64.0));
        assert!(close(data[11], 0.0));
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn submit_packs_counterclockwise_regions_with_the_opposite_affine_uv_axes() {
        let mut state = create_test_state_in_pass();
        register_wgpu_image_texture_resolver(&mut state);
        register_wgpu_standard_material(&mut state);
        let batch = rotated_batch(TextureAtlasRotation::Counterclockwise90);
        let mut proxies = prepare_test_scene(&mut state, &batch);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &batch);

        (WGPU_QUAD_BATCH_RENDERER.submit)(&mut state, proxy);

        let data = &get_wgpu_render_state_runtime(&state).quad_batch_writer_instance_data;
        assert!(close(data[6], 0.0));
        assert!(close(data[7], 40.0 / 64.0));
        assert!(close(data[9], -40.0 / 64.0));
        assert!(close(data[10], 20.0 / 64.0));
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn submit_lets_a_per_quad_tint_override_the_node_tint() {
        let mut state = create_test_state_in_pass();
        register_wgpu_image_texture_resolver(&mut state);
        register_wgpu_standard_material(&mut state);
        register_wgpu_color_adjustment_material_feature(&mut state);
        let batch = rotated_batch(TextureAtlasRotation::None);
        {
            let mut guard = batch.write().unwrap();
            let batch = guard
                .as_any_mut()
                .downcast_mut::<flight_quadbatch::QuadBatch>()
                .unwrap();
            let tint: flight_entity::Ref<dyn flight_materials::MaterialData> =
                std::sync::Arc::new(std::sync::RwLock::new(create_test_tint(0x80ffffff)));
            batch.data.material_data = Some(vec![Some(tint)]);
        }
        let mut proxies = prepare_test_scene(&mut state, &batch);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &batch);

        (WGPU_QUAD_BATCH_RENDERER.submit)(&mut state, proxy);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(matches!(
            runtime.quad_batch_writer_uniform_color_scale_bias,
            Some(WgpuColorScaleBiasInput::TintMaterialData(_))
        ));
        submit_wgpu_frame(&mut state);
    }
}
