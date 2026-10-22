use flight_geometry::{create_matrix, create_rectangle};
use flight_node::NodeRef;
use flight_render::RenderProxy2D;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

fn read_quad_geometry(data: &[f32]) -> Vec<[f32; 4]> {
    return (0..9)
        .map(|index| {
            let offset = index * QUAD_BATCH_INSTANCE_FLOATS;
            return [
                data[offset + 4],
                data[offset + 5],
                data[offset],
                data[offset + 3],
            ];
        })
        .collect();
}

fn scale9_proxy(state: &mut WgpuRenderState) -> RenderProxy2D<WgpuRenderState> {
    register_wgpu_image_texture_resolver(state);
    let sprite = flight_scene2d::create_scale9_sprite(&create_rectangle(10.0, 20.0, 30.0, 10.0));
    {
        let mut sprite = sprite.write().unwrap();
        sprite.data.texture = Some(create_test_texture(90, 60));
        sprite.scale_x = 2.0;
        sprite.scale_y = 3.0;
    }
    let node: NodeRef = sprite;
    let mut proxy = create_test_proxy_for(state, &node);
    proxy.transform_2d = create_matrix(2.0, 0.0, 0.0, 3.0, 5.0, 7.0);
    return proxy;
}

mod draw_wgpu_scale9_sprite {
    use super::*;

    #[test]
    fn emits_nine_independently_positioned_quad_instances() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        let proxy = scale9_proxy(&mut state);

        draw_wgpu_scale9_sprite(&mut state, &proxy);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.quad_batch_writer_count, 9);
        assert_eq!(
            read_quad_geometry(&runtime.quad_batch_writer_instance_data),
            vec![
                [5.0, 7.0, 10.0, 20.0],
                [15.0, 7.0, 120.0, 20.0],
                [135.0, 7.0, 50.0, 20.0],
                [5.0, 27.0, 10.0, 130.0],
                [15.0, 27.0, 120.0, 130.0],
                [135.0, 27.0, 50.0, 130.0],
                [5.0, 157.0, 10.0, 30.0],
                [15.0, 157.0, 120.0, 30.0],
                [135.0, 157.0, 50.0, 30.0],
            ]
        );
        let center = 4 * QUAD_BATCH_INSTANCE_FLOATS;
        let data = &runtime.quad_batch_writer_instance_data;
        let close = |a: f32, b: f32| (a - b).abs() < 1e-5;
        assert!(close(data[center + 6], 10.0 / 90.0));
        assert!(close(data[center + 7], 20.0 / 60.0));
        assert!(close(data[center + 8], 30.0 / 90.0));
        assert!(close(data[center + 9], 0.0));
        assert!(close(data[center + 10], 0.0));
        assert!(close(data[center + 11], 10.0 / 60.0));
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn indexes_parallel_instance_streams_from_the_post_flush_writer_count() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        register_wgpu_color_adjustment_material_feature(&mut state);
        let other = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(
            &mut state,
            &other,
            None,
            None,
            None,
            &STANDARD_WGPU_QUAD_MATERIAL_RENDERER,
            1,
            None,
        );
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        let mut proxy = scale9_proxy(&mut state);
        proxy.color_scale_bias = Some(create_test_color_scale_bias(
            0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        ));

        draw_wgpu_scale9_sprite(&mut state, &proxy);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.quad_batch_writer_count, 9);
        assert_eq!(runtime.quad_batch_writer_color_scale_bias_mode, Some(1));
        let Some(WgpuColorScaleBiasInput::ColorScaleBias(uniform)) =
            &runtime.quad_batch_writer_uniform_color_scale_bias
        else {
            panic!("a uniform color scale/bias");
        };
        assert_eq!(uniform.red_scale, 0.5);
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_scale9_sprite_renderer {
    use super::*;

    #[test]
    fn is_registered_separately_under_scale9_sprite_kind() {
        assert!(WGPU_SCALE9_SPRITE_RENDERER.is_dirty.is_some());
        assert!(std::ptr::fn_addr_eq(
            WGPU_SCALE9_SPRITE_RENDERER.submit,
            draw_wgpu_scale9_sprite as fn(_, _)
        ));
    }
}
