mod create_gl_skin_palette_texture {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::create_gl_skin_palette_texture;
    #[test]
    fn creates_an_empty_live_palette() {
        let state = make_state();
        let palette = create_gl_skin_palette_texture(&state).unwrap();
        assert_eq!(palette.joint_capacity, 0);
        assert!(!palette.destroyed);
    }
}
mod destroy_gl_skin_palette_texture {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::{create_gl_skin_palette_texture, destroy_gl_skin_palette_texture};
    #[test]
    fn deletes_once_while_context_is_live() {
        let state = make_state();
        let mut palette = create_gl_skin_palette_texture(&state).unwrap();
        destroy_gl_skin_palette_texture(&state, &mut palette);
        let calls = calls_named("delete_name");
        destroy_gl_skin_palette_texture(&state, &mut palette);
        assert_eq!(calls_named("delete_name"), calls);
    }
}
mod initialize_gl_skin_palette_texture {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{create_gl_skin_palette_texture, initialize_gl_skin_palette_texture};
    #[test]
    fn resets_capacity_and_destroyed_state() {
        let state = make_state();
        let mut palette = create_gl_skin_palette_texture(&state).unwrap();
        palette.joint_capacity = 9;
        palette.destroyed = true;
        initialize_gl_skin_palette_texture(&mut palette);
        assert_eq!(palette.joint_capacity, 0);
        assert!(!palette.destroyed);
    }
}
mod upload_gl_skin_palette_texture {
    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, last_call, make_state, set_integer,
    };
    use flight_render_gl::{create_gl_skin_palette_texture, upload_gl_skin_palette_texture};

    fn palette(joints: usize) -> Vec<f32> {
        return (0..joints * 16).map(|index| index as f32).collect();
    }

    #[test]
    fn allocates_rgba32f_storage_and_sets_nearest_clamp_policy_on_first_upload() {
        let state = make_state();
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        clear_calls();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(3), 3, None).unwrap();
        assert_eq!(palette_texture.joint_capacity, 3);
        let allocation = last_call("tex_image_2d");
        assert_eq!(
            allocation.integers,
            vec![
                i64::from(glow::TEXTURE_2D),
                0,
                i64::from(glow::RGBA32F),
                12,
                1,
                0,
                i64::from(glow::RGBA),
                i64::from(glow::FLOAT),
                0,
            ]
        );
        let parameters = calls_with("tex_parameter_i");
        assert_eq!(parameters.len(), 4);
        assert!(parameters.iter().any(|call| {
            call.integers
                == vec![
                    i64::from(glow::TEXTURE_2D),
                    i64::from(glow::TEXTURE_MIN_FILTER),
                    i64::from(glow::NEAREST),
                ]
        }));
        assert!(parameters.iter().any(|call| {
            call.integers
                == vec![
                    i64::from(glow::TEXTURE_2D),
                    i64::from(glow::TEXTURE_WRAP_T),
                    i64::from(glow::CLAMP_TO_EDGE),
                ]
        }));
    }

    #[test]
    fn binds_the_palette_texture_for_the_callers_sampler_unit() {
        let state = make_state();
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        clear_calls();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(1), 1, None).unwrap();
        assert_eq!(
            calls_with("bind_texture")[0].integers,
            vec![
                i64::from(glow::TEXTURE_2D),
                i64::from(palette_texture.texture.0.get()),
            ]
        );
    }

    #[test]
    fn disables_upload_premultiplication_before_uploading() {
        let state = make_state();
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .unpack_premultiply_alpha = true;
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(2), 2, None).unwrap();
        assert!(
            !state
                .context_state
                .runtime_state
                .borrow()
                .unpack_premultiply_alpha
        );
    }

    #[test]
    fn grows_storage_when_the_palette_exceeds_current_capacity() {
        let state = make_state();
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(2), 2, None).unwrap();
        clear_calls();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(5), 5, None).unwrap();
        assert_eq!(last_call("tex_image_2d").integers[3], 20);
        assert_eq!(palette_texture.joint_capacity, 5);
    }

    #[test]
    fn is_alias_safe_when_growing_joint_capacity() {
        let state = make_state();
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        let joint_count = 6;
        upload_gl_skin_palette_texture(
            &state,
            &mut palette_texture,
            &palette(joint_count),
            joint_count,
            None,
        )
        .unwrap();
        assert_eq!(palette_texture.joint_capacity, joint_count);
    }

    #[test]
    fn rejects_nonpositive_max_texture_size_and_short_matrix_payloads() {
        let state = make_state();
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        assert_eq!(
            upload_gl_skin_palette_texture(&state, &mut palette_texture, &[0.0; 15], 1, None,)
                .unwrap_err(),
            "uploadGlSkinPaletteTexture: expected 16 floats, received 15"
        );
        set_integer(glow::MAX_TEXTURE_SIZE, 0);
        assert_eq!(
            upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(1), 1, None,)
                .unwrap_err(),
            "GL MAX_TEXTURE_SIZE must be greater than zero"
        );
    }

    #[test]
    fn uploads_multirow_subimages_when_data_fits_existing_capacity() {
        let state = make_state();
        set_integer(glow::MAX_TEXTURE_SIZE, 16);
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(6), 6, None).unwrap();
        clear_calls();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(5), 5, None).unwrap();
        assert_eq!(calls_named("tex_image_2d"), 0);
        let rows = calls_with("tex_sub_image_2d");
        assert_eq!(rows.len(), 2);
        assert_eq!((rows[0].integers[3], rows[0].integers[4]), (0, 16));
        assert_eq!((rows[1].integers[3], rows[1].integers[4]), (1, 4));
    }

    #[test]
    fn uses_subimage_without_resetting_parameters_when_capacity_is_sufficient() {
        let state = make_state();
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(4), 4, None).unwrap();
        clear_calls();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(2), 2, None).unwrap();
        let subimage = last_call("tex_sub_image_2d");
        assert_eq!((subimage.integers[2], subimage.integers[3]), (0, 0));
        assert_eq!((subimage.integers[4], subimage.integers[5]), (8, 1));
        assert_eq!(palette_texture.joint_capacity, 4);
        assert_eq!(calls_named("tex_image_2d"), 0);
        assert_eq!(calls_named("tex_parameter_i"), 0);
    }

    #[test]
    fn wraps_storage_into_multiple_rows_at_the_max_texture_width() {
        let state = make_state();
        set_integer(glow::MAX_TEXTURE_SIZE, 16);
        let mut palette_texture = create_gl_skin_palette_texture(&state).unwrap();
        clear_calls();
        upload_gl_skin_palette_texture(&state, &mut palette_texture, &palette(5), 5, None).unwrap();
        let allocation = last_call("tex_image_2d");
        assert_eq!((allocation.integers[3], allocation.integers[4]), (16, 2));
        assert_eq!(allocation.integers[8], 1);
        assert!(allocation.bytes.is_empty());
        assert_eq!(palette_texture.joint_capacity, 5);
        let rows = calls_with("tex_sub_image_2d");
        assert_eq!(rows.len(), 2);
        assert_eq!((rows[0].integers[3], rows[0].integers[4]), (0, 16));
        assert_eq!((rows[1].integers[3], rows[1].integers[4]), (1, 4));
    }
}
