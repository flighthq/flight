use flight_node::NodeRef;
use flight_render::get_or_create_render_proxy_2d;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;
use flight_texture::{TextureUvTransform, set_texture_uv_from_pixel_rect};

use crate::support::*;

const CT_MODE_UNIFORM: u32 = 1;

fn instance_data(state: &WgpuRenderState) -> Vec<f32> {
    return get_wgpu_render_state_runtime(state)
        .quad_batch_writer_instance_data
        .clone();
}

fn close(a: f32, b: f32) -> bool {
    return (a - b).abs() < 1e-5;
}

mod draw_wgpu_sprite {
    use super::*;

    #[test]
    fn accepts_an_unbound_sprite() {
        let mut state = create_test_state_in_pass();
        let node: NodeRef = flight_scene2d::create_sprite();
        let mut proxies = prepare_test_scene(&mut state, &node);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &node);
        draw_wgpu_sprite(&mut state, proxy);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_count,
            0
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn records_a_tint_against_the_instance_the_flush_uploads_when_a_new_texture_breaks_the_batch() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        register_wgpu_color_adjustment_material_feature(&mut state);

        let first: NodeRef = create_test_sprite(&mut state, 32, 32);
        let mut proxies = prepare_test_scene(&mut state, &first);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &first);
        draw_wgpu_sprite(&mut state, proxy);
        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_count,
            1
        );

        let second: NodeRef = create_test_sprite(&mut state, 16, 16);
        let mut proxies = prepare_test_scene(&mut state, &second);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &second);
        proxy.color_scale_bias = Some(create_test_color_scale_bias(
            0.5, 0.5, 0.5, 1.0, 0.0, 0.0, 0.0, 0.0,
        ));
        draw_wgpu_sprite(&mut state, proxy);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.quad_batch_writer_count, 1);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_UNIFORM)
        );
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn uses_the_physical_slab_once_and_preserves_a_top_origin_sub_view() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        let sprite = create_test_sprite(&mut state, 720, 480);
        {
            let texture = sprite.read().unwrap().data.texture.clone().unwrap();
            let mut texture = texture.write().unwrap();
            set_texture_uv_from_pixel_rect(&mut *texture, 140.0, 160.0, 100.0, 80.0);
        }
        let node: NodeRef = sprite;
        let mut proxies = prepare_test_scene(&mut state, &node);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &node);

        draw_wgpu_sprite(&mut state, proxy);

        let data = instance_data(&state);
        assert!(close(data[0], 100.0));
        assert!(close(data[3], 80.0));
        assert!(close(data[6], 140.0 / 720.0));
        assert!(close(data[7], 160.0 / 480.0));
        assert!(close(data[8], 100.0 / 720.0));
        assert!(close(data[11], 80.0 / 480.0));
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn packs_a_quarter_turned_texture_view_as_affine_uv_axes() {
        let mut state = create_test_state_in_pass();
        register_wgpu_standard_material(&mut state);
        let sprite = create_test_sprite(&mut state, 100, 50);
        {
            let texture = sprite.read().unwrap().data.texture.clone().unwrap();
            let mut texture = texture.write().unwrap();
            let fields = texture.texture_fields_mut();
            fields.uv_offset.x = 0.1;
            fields.uv_offset.y = 0.4;
            fields.uv_scale.x = 0.3;
            fields.uv_scale.y = 0.2;
            fields.uv_rotation = -std::f32::consts::FRAC_PI_2;
        }
        let node: NodeRef = sprite;
        let mut proxies = prepare_test_scene(&mut state, &node);
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &node);

        draw_wgpu_sprite(&mut state, proxy);

        let data = instance_data(&state);
        assert!(close(data[0], 15.0));
        assert!(close(data[3], 20.0));
        assert!(close(data[6], 0.1));
        assert!(close(data[7], 0.4));
        assert!(close(data[8], 0.0));
        assert!(close(data[9], -0.3));
        assert!(close(data[10], 0.2));
        assert!(close(data[11], 0.0));
        submit_wgpu_frame(&mut state);
    }
}

mod wgpu_sprite_renderer {
    use super::*;

    #[test]
    fn has_create_data_is_dirty_and_submit_functions() {
        assert!(WGPU_SPRITE_RENDERER.is_dirty.is_some());
        assert!(std::ptr::fn_addr_eq(
            WGPU_SPRITE_RENDERER.submit,
            draw_wgpu_sprite as fn(_, _)
        ));
    }
}
