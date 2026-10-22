// flight-lint: allow-file(test-default-call) Native option and realization scaffolding uses Rust defaults.
mod apply_gl_blend_mode {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::apply_gl_blend_mode;
    #[test]
    fn caches_the_fixed_function_signature() {
        let mut state = make_state();
        apply_gl_blend_mode(&mut state, None);
        apply_gl_blend_mode(&mut state, None);
        assert_eq!(calls_named("blend_func"), 2);
        assert!(
            state
                .context_state
                .runtime_state
                .borrow()
                .current_blend_signature
                .is_some()
        );
    }
}
mod apply_gl_sampler_state {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::{apply_gl_sampler_state, create_gl_texture};
    use flight_texture::create_sampler;
    #[test]
    fn generates_mipmaps_at_most_once_per_texture() {
        let state = make_state();
        let texture = create_gl_texture(&state).unwrap();
        let sampler = create_sampler();
        apply_gl_sampler_state(&state, texture, Some(&sampler), None);
        apply_gl_sampler_state(&state, texture, Some(&sampler), None);
        assert_eq!(calls_named("generate_mipmap"), 1);
    }
}
mod bind_gl_bitmap_texture {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_bitmap::create_bitmap;
    use flight_render_gl::bind_gl_bitmap_texture;
    use flight_texture::TextureColorSpace;
    #[test]
    fn uploads_once_per_source_version_and_cache_key() {
        let state = make_state();
        let bitmap = create_bitmap(2, 2, Some(0xff000080));
        let first =
            bind_gl_bitmap_texture(&state, &bitmap, None, None, true, TextureColorSpace::Srgb)
                .unwrap();
        let second =
            bind_gl_bitmap_texture(&state, &bitmap, None, None, true, TextureColorSpace::Srgb)
                .unwrap();
        assert_eq!(first, second);
        assert_eq!(calls_named("tex_image_2d"), 1);
    }
}
mod bind_gl_compressed_image_texture {
    use crate::gl_test_helper::{make_compressed_image_resource, make_state};
    use flight_render_gl::bind_gl_compressed_image_texture;
    use flight_texture::TextureColorSpace;
    #[test]
    fn caches_the_source_even_without_an_optional_uploader() {
        let state = make_state();
        let image = make_compressed_image_resource();
        let image = image.read().unwrap();
        let first =
            bind_gl_compressed_image_texture(&state, &image, None, None, TextureColorSpace::Linear)
                .unwrap();
        let second =
            bind_gl_compressed_image_texture(&state, &image, None, None, TextureColorSpace::Linear)
                .unwrap();
        assert_eq!(first, second);
    }
}
mod bind_gl_image_resource_texture {
    use crate::gl_test_helper::{calls_named, make_image_resource, make_state};
    use flight_render_gl::bind_gl_image_resource_texture;
    use flight_texture::TextureColorSpace;
    #[test]
    fn uploads_host_tokens_and_caches_the_result() {
        let state = make_state();
        let image = make_image_resource(2, 3, true);
        let image = image.read().unwrap();
        let first = bind_gl_image_resource_texture(
            &state,
            &image,
            None,
            None,
            false,
            TextureColorSpace::Srgb,
        )
        .unwrap();
        let second = bind_gl_image_resource_texture(
            &state,
            &image,
            None,
            None,
            false,
            TextureColorSpace::Srgb,
        )
        .unwrap();
        assert_eq!(first, second);
        assert_eq!(calls_named("tex_image_2d"), 1);
    }
}
mod bind_gl_texture {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::{GlImageSourceToken, bind_gl_texture};
    use std::sync::Arc;
    #[test]
    fn keys_legacy_tokens_by_explicit_source_identity() {
        let state = make_state();
        let source = GlImageSourceToken {
            width: 1,
            height: 1,
            ready: true,
            pixels: Arc::new(vec![1, 2, 3, 4]),
        };
        let first = bind_gl_texture(&state, &source, 77, None).unwrap();
        let second = bind_gl_texture(&state, &source, 77, None).unwrap();
        assert_eq!(first, second);
        assert_eq!(calls_named("tex_image_2d"), 1);
    }
}
mod bind_gl_texture_realization {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{GlTextureRealization, bind_gl_texture_realization, create_gl_texture};
    #[test]
    fn synchronizes_physical_binding_and_shared_cache() {
        let state = make_state();
        let texture = create_gl_texture(&state).unwrap();
        let realization = GlTextureRealization {
            texture,
            straight_alpha: true,
        };
        assert_eq!(
            bind_gl_texture_realization(&state, Some(realization)),
            Some(texture)
        );
        assert_eq!(
            state
                .context_state
                .runtime_state
                .borrow()
                .current_texture_realization,
            Some(realization)
        );
        assert_eq!(bind_gl_texture_realization(&state, None), None);
    }
}
mod bind_gl_video_texture {
    use crate::gl_test_helper::{calls_named, make_image_resource, make_state};
    use flight_render_gl::bind_gl_video_texture;
    use flight_texture::create_texture_2d;
    #[test]
    fn uploads_a_ready_frame_once_per_version() {
        let state = make_state();
        let texture = create_texture_2d();
        let image = make_image_resource(2, 2, true);
        let image = image.read().unwrap();
        let first = bind_gl_video_texture(&state, &texture, &image, None).unwrap();
        let second = bind_gl_video_texture(&state, &texture, &image, None).unwrap();
        assert_eq!(first, second);
        assert_eq!(calls_named("tex_image_2d"), 1);
    }
}
mod convert_rgba8_alpha_encoding {
    use flight_render_gl::convert_rgba8_alpha_encoding;
    #[test]
    fn matches_javascript_clamping_for_premultiply_unpremultiply_and_partial_tails() {
        assert_eq!(
            convert_rgba8_alpha_encoding(&[200, 100, 50, 128], true),
            vec![100, 50, 25, 128]
        );
        assert_eq!(
            convert_rgba8_alpha_encoding(&[100, 50, 25, 128], false),
            vec![199, 100, 50, 128]
        );
        assert_eq!(convert_rgba8_alpha_encoding(&[1, 2], true), vec![1, 2]);
    }
}
mod create_gl_texture {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::create_gl_texture;
    #[test]
    fn allocates_binds_and_initializes_sampler_defaults() {
        let state = make_state();
        assert!(create_gl_texture(&state).is_ok());
        assert_eq!(calls_named("bind_texture"), 1);
        assert_eq!(calls_named("tex_parameter_i"), 4);
    }
}
mod draw_gl_quad {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::{draw_gl_quad, use_gl_program};
    #[test]
    fn uploads_interleaved_vertices_and_draws_two_triangles() {
        let state = make_state();
        use_gl_program(&state, None).unwrap();
        draw_gl_quad(&state, 1.0, 2.0, 3.0, 4.0, 0.0, 0.0, 1.0, 1.0).unwrap();
        assert_eq!(
            state.gl_runtime.borrow().quad_vertex_data,
            [
                1.0, 2.0, 0.0, 0.0, 3.0, 2.0, 1.0, 0.0, 3.0, 4.0, 1.0, 1.0, 1.0, 4.0, 0.0, 1.0
            ]
        );
        assert_eq!(calls_named("draw_elements"), 1);
    }
}
mod enable_gl_blend_mode_support {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{enable_gl_blend_mode_support, is_blend_mode_supported};
    #[test]
    fn installs_standard_realizations_and_apply_hook() {
        let mut state = make_state();
        enable_gl_blend_mode_support(&mut state);
        assert!(is_blend_mode_supported(
            &state,
            &flight_materials::BLEND_MODE_NORMAL.to_string()
        ));
        assert!(state.apply_blend_mode.is_some());
    }
}
mod is_blend_mode_supported {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{is_blend_mode_supported, register_default_gl_blend_modes};
    #[test]
    fn checks_the_state_owned_registry() {
        let mut state = make_state();
        assert!(!is_blend_mode_supported(
            &state,
            &flight_materials::BLEND_MODE_NORMAL.to_string()
        ));
        register_default_gl_blend_modes(&mut state);
        assert!(is_blend_mode_supported(
            &state,
            &flight_materials::BLEND_MODE_NORMAL.to_string()
        ));
    }
}
mod register_default_gl_blend_modes {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::register_default_gl_blend_modes;
    #[test]
    fn installs_all_six_source_modes() {
        let mut state = make_state();
        register_default_gl_blend_modes(&mut state);
        assert_eq!(state.gl_registries.blend_realizations.entries.len(), 6);
    }
}
mod register_gl_blend_mode {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{GlBlendFactor, GlBlendRealization, register_gl_blend_mode};
    #[test]
    fn replaces_an_immutable_registry_snapshot() {
        let mut state = make_state();
        let realization = GlBlendRealization {
            src: GlBlendFactor::Zero,
            dst: GlBlendFactor::One,
            equation: None,
        };
        register_gl_blend_mode(&mut state, "custom".into(), realization);
        assert_eq!(
            state.gl_registries.blend_realizations.entries.get("custom"),
            Some(&realization)
        );
    }
}
mod set_gl_quad_matrix_from_offset {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{set_gl_quad_matrix_from_offset, use_gl_program};
    #[test]
    fn folds_local_offset_through_the_affine_basis() {
        let state = make_state();
        use_gl_program(&state, None).unwrap();
        set_gl_quad_matrix_from_offset(&state, 1.0, 0.0, 0.0, 1.0, 10.0, 20.0, 3.0, 4.0).unwrap();
        assert_eq!(
            state.gl_runtime.borrow().matrix_array[6],
            13.0 * 2.0 / 640.0 - 1.0
        );
    }
}
mod standard_gl_blend_realizations {
    use flight_render_gl::standard_gl_blend_realizations;
    #[test]
    fn returns_the_canonical_source_order() {
        let map = standard_gl_blend_realizations();
        assert_eq!(map.key_order.len(), 6);
        assert_eq!(map.key_order[0], flight_materials::BLEND_MODE_ADD);
        assert_eq!(map.key_order[4], flight_materials::BLEND_MODE_NORMAL);
    }
}
mod update_gl_texture {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::{GlImageSourceToken, create_gl_texture, update_gl_texture};
    use std::sync::Arc;
    #[test]
    fn refreshes_pixels_and_existing_mipmaps() {
        let state = make_state();
        let texture = create_gl_texture(&state).unwrap();
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .texture_caches
            .mipmapped
            .insert(texture);
        let source = GlImageSourceToken {
            width: 1,
            height: 1,
            ready: true,
            pixels: Arc::new(vec![255; 4]),
        };
        update_gl_texture(&state, texture, &source);
        assert_eq!(calls_named("tex_image_2d"), 1);
        assert_eq!(calls_named("generate_mipmap"), 1);
    }
}
mod use_gl_program {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::use_gl_program;
    use std::sync::Arc;
    #[test]
    fn switches_once_then_reuses_the_cached_program() {
        let state = make_state();
        let first = use_gl_program(&state, None).unwrap();
        let second = use_gl_program(&state, None).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(calls_named("use_program"), 1);
        assert_eq!(state.gl_runtime.borrow().stats.program_switches, 1);
    }
}
