// flight-lint: allow-file(test-default-call) Pool descriptors use their canonical Rust defaults.
mod acquire_gl_render_texture {
    use crate::gl_test_helper::{make_state, make_target_descriptor};
    use flight_render_gl::{
        GlRenderTextureStatus, acquire_gl_render_texture, create_gl_render_texture_pool,
        explain_gl_render_texture, release_gl_render_texture, write_gl_render_texture_target,
    };
    use flight_texture::{TextureUvTransform, TextureVariant};

    fn source_id(texture: &flight_render::RenderTexture) -> u64 {
        let source = texture
            .source_2d()
            .unwrap()
            .as_ref()
            .unwrap()
            .read()
            .unwrap();
        return flight_entity::get_entity_id(&*source);
    }

    #[test]
    fn does_not_allow_a_pool_to_cross_gl_contexts() {
        let state_a = make_state();
        let state_b = make_state();
        let mut pool = create_gl_render_texture_pool();
        acquire_gl_render_texture(&state_a, &mut pool, &make_target_descriptor(8.0, 8.0)).unwrap();
        assert_eq!(
            acquire_gl_render_texture(&state_b, &mut pool, &make_target_descriptor(8.0, 8.0),)
                .unwrap_err(),
            "GlRenderTexturePool cannot cross GL contexts"
        );
    }

    #[test]
    fn resets_a_released_slab_view_before_the_next_logical_target() {
        let state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut slab =
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(720.0, 480.0))
                .unwrap();
        slab.texture_fields_mut().flip_x = true;
        slab.texture_fields_mut().flip_y = true;
        slab.texture_fields_mut().uv_offset.x = 140.0 / 720.0;
        slab.texture_fields_mut().uv_offset.y = 160.0 / 480.0;
        slab.texture_fields_mut().uv_rotation = std::f32::consts::FRAC_PI_2;
        slab.texture_fields_mut().uv_scale.x = 100.0 / 720.0;
        slab.texture_fields_mut().uv_scale.y = 80.0 / 480.0;
        let source_id = source_id(&slab);
        release_gl_render_texture(&state, &mut pool, slab).unwrap();
        let logical =
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(100.0, 80.0))
                .unwrap();
        assert_eq!(self::source_id(&logical), source_id);
        assert!(!logical.texture_fields().flip_x);
        assert!(!logical.texture_fields().flip_y);
        assert_eq!(logical.texture_fields().uv_offset.x, 0.0);
        assert_eq!(logical.texture_fields().uv_offset.y, 0.0);
        assert_eq!(logical.texture_fields().uv_rotation, 0.0);
        assert_eq!(logical.texture_fields().uv_scale.x, 1.0);
        assert_eq!(logical.texture_fields().uv_scale.y, 1.0);
    }

    #[test]
    fn reuses_a_released_handle_and_applies_current_dimensions() {
        let mut state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut first =
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(32.0, 16.0))
                .unwrap();
        write_gl_render_texture_target(&mut state, &mut first, |_state, _target| Ok(())).unwrap();
        let source_id = source_id(&first);
        release_gl_render_texture(&state, &mut pool, first).unwrap();
        assert_eq!(pool.free.len(), 1);

        let mut second =
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(80.0, 48.0))
                .unwrap();
        assert_eq!(self::source_id(&second), source_id);
        let source = second
            .source_2d()
            .unwrap()
            .as_ref()
            .unwrap()
            .read()
            .unwrap();
        let fields = source.texture_source_fields();
        assert_eq!((fields.width, fields.height), (80, 48));
        drop(source);
        assert_eq!(
            explain_gl_render_texture(&state, &second).status,
            GlRenderTextureStatus::Unrendered
        );
        assert_eq!(pool.leased.len(), 1);
        write_gl_render_texture_target(&mut state, &mut second, |_state, _target| Ok(())).unwrap();
        assert_eq!(
            explain_gl_render_texture(&state, &second),
            flight_render_gl::GlRenderTextureExplanation {
                width: 80,
                height: 48,
                status: GlRenderTextureStatus::Ready,
            }
        );
    }
}
mod create_gl_render_texture_pool {
    use flight_render_gl::create_gl_render_texture_pool;
    #[test]
    fn creates_an_empty_live_unbound_pool() {
        let pool = create_gl_render_texture_pool();
        assert!(!pool.destroyed);
        assert!(pool.context_id.is_none());
        assert!(pool.free.is_empty());
    }
}
mod destroy_gl_render_texture_pool {
    use crate::gl_test_helper::{calls_named, make_state, make_target_descriptor};
    use flight_render_gl::{
        acquire_gl_render_texture, create_gl_render_texture_pool, destroy_gl_render_texture_pool,
        release_gl_render_texture, write_gl_render_texture_target,
    };

    #[test]
    fn destroys_hidden_targets_for_free_and_outstanding_leases() {
        let mut state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let mut free =
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(8.0, 8.0))
                .unwrap();
        let mut leased =
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(16.0, 16.0))
                .unwrap();
        write_gl_render_texture_target(&mut state, &mut free, |_state, _target| Ok(())).unwrap();
        write_gl_render_texture_target(&mut state, &mut leased, |_state, _target| Ok(())).unwrap();
        release_gl_render_texture(&state, &mut pool, free).unwrap();
        let deletes = calls_named("delete_textures");
        destroy_gl_render_texture_pool(&state, &mut pool).unwrap();
        assert_eq!(calls_named("delete_textures"), deletes + 2);
        assert!(pool.free.is_empty());
        assert!(pool.leased.is_empty());
        assert!(pool.destroyed);
    }

    #[test]
    fn rejects_acquisition_after_destruction() {
        let state = make_state();
        let mut pool = create_gl_render_texture_pool();
        destroy_gl_render_texture_pool(&state, &mut pool).unwrap();
        assert!(pool.leased.is_empty());
        assert_eq!(
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(1.0, 1.0))
                .unwrap_err(),
            "GlRenderTexturePool has been destroyed"
        );
    }
}
mod initialize_gl_render_texture_pool {
    use flight_render_gl::{create_gl_render_texture_pool, initialize_gl_render_texture_pool};
    #[test]
    fn resets_destroyed_and_context_ownership() {
        let mut pool = create_gl_render_texture_pool();
        pool.destroyed = true;
        pool.context_id = Some(9);
        initialize_gl_render_texture_pool(&mut pool);
        assert!(!pool.destroyed);
        assert!(pool.context_id.is_none());
    }
}
mod release_gl_render_texture {
    use crate::gl_test_helper::{make_state, make_target_descriptor};
    use flight_render_gl::{
        acquire_gl_render_texture, create_gl_render_texture_pool, release_gl_render_texture,
    };
    #[test]
    fn rejects_a_double_release() {
        let state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let texture =
            acquire_gl_render_texture(&state, &mut pool, &make_target_descriptor(2.0, 2.0))
                .unwrap();
        release_gl_render_texture(&state, &mut pool, texture).unwrap();
        assert!(pool.leased.is_empty());
        assert_eq!(pool.free.len(), 1);
        let texture = pool.free.pop().unwrap();
        assert_eq!(
            release_gl_render_texture(&state, &mut pool, texture).unwrap_err(),
            "releaseGlRenderTexture: texture is not leased from this pool"
        );
    }
}
mod with_gl_render_textures {
    use crate::gl_test_helper::{make_state, make_target_descriptor};
    use flight_render_gl::{create_gl_render_texture_pool, with_gl_render_textures};
    #[test]
    fn releases_every_lease_when_the_callback_panics() {
        let state = make_state();
        let mut pool = create_gl_render_texture_pool();
        let descriptors = [
            make_target_descriptor(1.0, 1.0),
            make_target_descriptor(2.0, 2.0),
            make_target_descriptor(3.0, 3.0),
        ];
        let panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            with_gl_render_textures(&state, &mut pool, &descriptors, |_textures| {
                panic!("capture failed")
            })
            .unwrap();
        }));
        assert!(panic.is_err());
        assert!(pool.leased.is_empty());
        assert_eq!(pool.free.len(), 3);
    }
}
