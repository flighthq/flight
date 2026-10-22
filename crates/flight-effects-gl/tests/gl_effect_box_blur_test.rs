mod apply_gl_effect_box_blur {
    use flight_effects_gl::contract::{GlEffectBoxBlurOptions, apply_gl_effect_box_blur};

    use crate::gl_test_helper::{
        clear_calls, draws, make_state, make_texture_target, uniform_values,
    };

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        let dest = make_texture_target(&state, 32.0, 16.0);
        let temp = make_texture_target(&state, 32.0, 16.0);
        clear_calls();
        apply_gl_effect_box_blur(
            &mut state,
            &source,
            &dest,
            &temp,
            &GlEffectBoxBlurOptions {
                blur_x: None,
                blur_y: None,
                passes: None,
                edge_color: None,
            },
        )
        .unwrap();
        assert!(!draws().is_empty());
    }

    #[test]
    fn binds_the_exterior_edge_color_when_one_is_provided() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        let dest = make_texture_target(&state, 32.0, 16.0);
        let temp = make_texture_target(&state, 32.0, 16.0);
        clear_calls();
        apply_gl_effect_box_blur(
            &mut state,
            &source,
            &dest,
            &temp,
            &GlEffectBoxBlurOptions {
                blur_x: Some(4.0),
                blur_y: Some(0.0),
                edge_color: Some([0.1, 0.2, 0.3, 0.4]),
                passes: Some(1.0),
            },
        )
        .unwrap();
        assert_eq!(uniform_values("u_edgeColor")[0], vec![0.1, 0.2, 0.3, 0.4]);
        assert!(uniform_values("u_useEdgeColor").contains(&vec![1.0]));
        assert!(
            draws()
                .iter()
                .all(|draw| (draw.blend_src, draw.blend_dst)
                    == (glow::ONE as i32, glow::ZERO as i32))
        );
    }

    #[test]
    fn copies_source_to_dest_with_a_tail_blit_when_every_pass_radius_is_zero() {
        let mut state = make_state();
        let source = make_texture_target(&state, 32.0, 16.0);
        let dest = make_texture_target(&state, 32.0, 16.0);
        let temp = make_texture_target(&state, 32.0, 16.0);
        clear_calls();
        apply_gl_effect_box_blur(
            &mut state,
            &source,
            &dest,
            &temp,
            &GlEffectBoxBlurOptions {
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                edge_color: None,
                passes: Some(1.0),
            },
        )
        .unwrap();
        let recorded = draws();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].textures[0], source.texture.0.get() as i32);
        assert_eq!(recorded[0].framebuffer, dest.framebuffer.0.get() as i32);
    }
}
