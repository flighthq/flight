use std::sync::{Arc, RwLock};

use flight_node::NodeRef;
use flight_render::{
    BatchFormat, CreateRenderTextureOptions, RenderProxy2D, create_render_texture,
};
use flight_render::RenderTargetClear;
use flight_render_gl::{
    GlRenderState, register_gl_bitmap_texture_resolver, register_gl_render_texture_resolver,
    render_into_gl_render_texture,
};
use flight_scene2d_gl::contract::*;
use flight_texture::{Texture, set_texture_uv_from_pixel_rect};

use crate::gl_test_helper::{
    count_calls, create_gl_state, make_bitmap_texture, make_color_scale_bias, make_scene2d_proxy,
};

const CT_MODE_UNIFORM: u32 = 1;

fn make_sprite(texture: flight_entity::Ref<Texture>) -> NodeRef {
    let sprite = flight_scene2d::create_sprite();
    sprite.write().unwrap().data.texture = Some(texture);
    return sprite;
}

fn make_render_proxy(state: &mut GlRenderState, sprite: NodeRef) -> RenderProxy2D<GlRenderState> {
    let mut proxy = make_scene2d_proxy(state, sprite);
    proxy.transform_2d = flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 10.0, 20.0);
    return proxy;
}

fn ct(scale: f32) -> flight_materials::ColorScaleBias {
    return make_color_scale_bias(scale, scale, scale, 1.0, 0.0, 0.0, 0.0, 0.0);
}

fn instance_data(state: &GlRenderState) -> Vec<f32> {
    return state
        .gl_runtime
        .borrow()
        .quad_batch_writer_instance_data
        .clone();
}

fn close(actual: f32, expected: f32) -> bool {
    // D1 f32 bound (TS: toBeCloseTo 2 digits)
    return (actual - expected).abs()
        <= 0.005_f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
}

mod draw_gl_sprite {
    use super::*;

    #[test]
    fn writes_natural_size_and_uv_window_into_the_shared_batch() {
        let mut state = create_gl_state();
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_standard_material(&mut state);
        let texture = make_bitmap_texture(128, 64);
        set_texture_uv_from_pixel_rect(&mut *texture.write().unwrap(), 16.0, 8.0, 32.0, 16.0);
        let proxy = make_render_proxy(&mut state, make_sprite(texture));

        draw_gl_sprite(&mut state, &proxy);

        let data = instance_data(&state);
        let expected = [
            32.0, 0.0, 0.0, 16.0, 10.0, 20.0, 0.125, 0.125, 0.25, 0.0, 0.0, 0.25,
        ];
        for (index, value) in expected.iter().enumerate() {
            assert!(close(data[index], *value), "index {index}: {}", data[index]);
        }
    }

    #[test]
    fn uses_the_physical_slab_once_and_reflects_a_render_target_sub_view_into_gl_coordinates() {
        let mut state = create_gl_state();
        register_gl_render_texture_resolver(&mut state);
        register_gl_standard_material(&mut state);
        let mut render_texture = create_render_texture(&CreateRenderTextureOptions {
            height: 480,
            width: 720,
            ..crate::gl_test_helper::test_default::<CreateRenderTextureOptions>()
        });
        set_texture_uv_from_pixel_rect(&mut render_texture, 140.0, 160.0, 100.0, 80.0);
        render_into_gl_render_texture(
            &mut state,
            &mut render_texture,
            |_state, _target| Ok(()),
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: Some(1.0),
                stencil: Some(0),
            },
        )
        .unwrap();
        let texture = Arc::new(RwLock::new(Texture::Texture2D(render_texture)));
        let proxy = make_render_proxy(&mut state, make_sprite(texture));

        draw_gl_sprite(&mut state, &proxy);

        let data = instance_data(&state);
        assert!(close(data[0], 100.0));
        assert!(close(data[3], 80.0));
        assert!(close(data[6], 140.0 / 720.0));
        assert!(close(data[7], 1.0 - 160.0 / 480.0));
        assert!(close(data[8], 100.0 / 720.0));
        assert!(close(data[11], -80.0 / 480.0));
    }

    #[test]
    fn packs_a_rotated_texture_view_as_affine_uv_axes_without_growing_the_instance_record() {
        let mut state = create_gl_state();
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_standard_material(&mut state);
        let texture = make_bitmap_texture(100, 50);
        {
            let mut guard = texture.write().unwrap();
            let fields = flight_texture::TextureUvTransform::texture_fields_mut(&mut *guard);
            fields.uv_offset.x = 0.1;
            fields.uv_offset.y = 0.4;
            fields.uv_scale.x = 0.3;
            fields.uv_scale.y = 0.2;
            fields.uv_rotation = -std::f32::consts::PI / 2.0;
        }
        let proxy = make_render_proxy(&mut state, make_sprite(texture));

        draw_gl_sprite(&mut state, &proxy);

        let data = instance_data(&state);
        assert!(close(data[0], 15.0));
        assert!(close(data[3], 20.0));
        assert!(close(data[6], 0.1));
        assert!(close(data[7], 0.4));
        assert!(close(data[8], 0.0));
        assert!(close(data[9], -0.3));
        assert!(close(data[10], 0.2));
        assert!(close(data[11], 0.0));
    }

    #[test]
    fn records_a_tint_against_the_instance_the_flush_uploads_when_a_new_texture_breaks_the_batch() {
        let mut state = create_gl_state();
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_standard_material(&mut state);
        register_gl_color_adjustment_material_feature(&mut state);

        let first = make_render_proxy(&mut state, make_sprite(make_bitmap_texture(32, 32)));
        draw_gl_sprite(&mut state, &first);
        assert_eq!(state.gl_runtime.borrow().quad_batch_writer_count, 1);

        let mut tinted = make_render_proxy(&mut state, make_sprite(make_bitmap_texture(16, 16)));
        tinted.color_scale_bias = Some(ct(0.5));
        draw_gl_sprite(&mut state, &tinted);

        let runtime = state.gl_runtime.borrow();
        assert_eq!(runtime.quad_batch_writer_count, 1);
        assert_eq!(
            runtime.quad_batch_writer_color_scale_bias_mode,
            Some(CT_MODE_UNIFORM)
        );
    }

    #[test]
    fn resolves_and_draws_the_texture_on_flush() {
        let mut state = create_gl_state();
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_standard_material(&mut state);
        let proxy = make_render_proxy(&mut state, make_sprite(make_bitmap_texture(64, 48)));
        draw_gl_sprite(&mut state, &proxy);
        flush_gl_quad_batch_writer(&mut state);
        assert_eq!(count_calls("draw_elements_instanced"), 1);
    }

    #[test]
    fn sprite_renderer_declares_the_quad_format_and_submit_function() {
        assert_eq!(GL_SPRITE_RENDERER.format, Some(BatchFormat::Quad));
        assert!(GL_SPRITE_RENDERER.is_dirty.is_some());
        assert!(std::ptr::fn_addr_eq(
            GL_SPRITE_RENDERER.submit,
            draw_gl_sprite as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }
}
