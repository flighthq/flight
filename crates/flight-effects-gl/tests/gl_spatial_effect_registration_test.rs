//! TS `glSpatialEffectRegistration.test.ts`: every public `register_gl_<kind>_effect` installs its
//! public default runner on only the supplied state.

mod gl_effect_registration {
    use flight_effects_gl::contract::{GlEffectRunner, get_gl_effect_runner};
    use flight_render_gl::GlRenderState;

    use crate::gl_test_helper::make_state;

    fn assert_registers_only_the_supplied_state(
        kind: &str,
        register: fn(&mut GlRenderState),
        runner: GlEffectRunner,
    ) {
        let mut state = make_state();
        let other = make_state();
        register(&mut state);
        let registered = get_gl_effect_runner(&state, kind).unwrap();
        assert!(std::ptr::fn_addr_eq(registered, runner));
        assert!(get_gl_effect_runner(&other, kind).is_none());
    }

    #[test]
    fn registers_the_public_bevel_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "BevelEffect",
            flight_effects_gl::register_gl_bevel_effect,
            flight_effects_gl::contract::gl_bevel_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_bitmap_displacement_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "BitmapDisplacementEffect",
            flight_effects_gl::register_gl_bitmap_displacement_effect,
            flight_effects_gl::contract::gl_bitmap_displacement_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_blend_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "BlendEffect",
            flight_effects_gl::register_gl_blend_effect,
            flight_effects_gl::contract::gl_blend_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_bloom_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "BloomEffect",
            flight_effects_gl::register_gl_bloom_effect,
            flight_effects_gl::contract::gl_bloom_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_blur_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "BlurEffect",
            flight_effects_gl::register_gl_blur_effect,
            flight_effects_gl::contract::gl_blur_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_bokeh_depth_of_field_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "BokehDepthOfFieldEffect",
            flight_effects_gl::register_gl_bokeh_depth_of_field_effect,
            flight_effects_gl::contract::gl_bokeh_depth_of_field_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_camera_motion_blur_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "CameraMotionBlurEffect",
            flight_effects_gl::register_gl_camera_motion_blur_effect,
            flight_effects_gl::contract::gl_camera_motion_blur_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_chromatic_aberration_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "ChromaticAberrationEffect",
            flight_effects_gl::register_gl_chromatic_aberration_effect,
            flight_effects_gl::contract::gl_chromatic_aberration_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_composite_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "CompositeEffect",
            flight_effects_gl::register_gl_composite_effect,
            flight_effects_gl::contract::gl_composite_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_contact_shadows_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "ContactShadowsEffect",
            flight_effects_gl::register_gl_contact_shadows_effect,
            flight_effects_gl::contract::gl_contact_shadows_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_convolution_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "ConvolutionEffect",
            flight_effects_gl::register_gl_convolution_effect,
            flight_effects_gl::contract::gl_convolution_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_crt_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "CrtEffect",
            flight_effects_gl::register_gl_crt_effect,
            flight_effects_gl::contract::gl_crt_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_custom_shader_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "CustomShaderEffect",
            flight_effects_gl::register_gl_custom_shader_effect,
            flight_effects_gl::contract::gl_custom_shader_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_directional_blur_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "DirectionalBlurEffect",
            flight_effects_gl::register_gl_directional_blur_effect,
            flight_effects_gl::contract::gl_directional_blur_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_displacement_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "DisplacementEffect",
            flight_effects_gl::register_gl_displacement_effect,
            flight_effects_gl::contract::gl_displacement_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_dither_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "DitherEffect",
            flight_effects_gl::register_gl_dither_effect,
            flight_effects_gl::contract::gl_dither_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_drop_shadow_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "DropShadowEffect",
            flight_effects_gl::register_gl_drop_shadow_effect,
            flight_effects_gl::contract::gl_drop_shadow_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_film_grain_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "FilmGrainEffect",
            flight_effects_gl::register_gl_film_grain_effect,
            flight_effects_gl::contract::gl_film_grain_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_fxaa_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "FxaaEffect",
            flight_effects_gl::register_gl_fxaa_effect,
            flight_effects_gl::contract::gl_fxaa_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_glitch_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "GlitchEffect",
            flight_effects_gl::register_gl_glitch_effect,
            flight_effects_gl::contract::gl_glitch_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_god_rays_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "GodRaysEffect",
            flight_effects_gl::register_gl_god_rays_effect,
            flight_effects_gl::contract::gl_god_rays_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_gradient_bevel_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "GradientBevelEffect",
            flight_effects_gl::register_gl_gradient_bevel_effect,
            flight_effects_gl::contract::gl_gradient_bevel_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_gradient_glow_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "GradientGlowEffect",
            flight_effects_gl::register_gl_gradient_glow_effect,
            flight_effects_gl::contract::gl_gradient_glow_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_halftone_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "HalftoneEffect",
            flight_effects_gl::register_gl_halftone_effect,
            flight_effects_gl::contract::gl_halftone_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_inner_glow_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "InnerGlowEffect",
            flight_effects_gl::register_gl_inner_glow_effect,
            flight_effects_gl::contract::gl_inner_glow_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_inner_shadow_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "InnerShadowEffect",
            flight_effects_gl::register_gl_inner_shadow_effect,
            flight_effects_gl::contract::gl_inner_shadow_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_kuwahara_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "KuwaharaEffect",
            flight_effects_gl::register_gl_kuwahara_effect,
            flight_effects_gl::contract::gl_kuwahara_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_lens_dirt_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "LensDirtEffect",
            flight_effects_gl::register_gl_lens_dirt_effect,
            flight_effects_gl::contract::gl_lens_dirt_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_lens_distortion_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "LensDistortionEffect",
            flight_effects_gl::register_gl_lens_distortion_effect,
            flight_effects_gl::contract::gl_lens_distortion_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_lens_flare_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "LensFlareEffect",
            flight_effects_gl::register_gl_lens_flare_effect,
            flight_effects_gl::contract::gl_lens_flare_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_median_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "MedianEffect",
            flight_effects_gl::register_gl_median_effect,
            flight_effects_gl::contract::gl_median_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_motion_blur_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "MotionBlurEffect",
            flight_effects_gl::register_gl_motion_blur_effect,
            flight_effects_gl::contract::gl_motion_blur_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_outer_glow_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "OuterGlowEffect",
            flight_effects_gl::register_gl_outer_glow_effect,
            flight_effects_gl::contract::gl_outer_glow_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_outline_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "OutlineEffect",
            flight_effects_gl::register_gl_outline_effect,
            flight_effects_gl::contract::gl_outline_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_pixelate_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "PixelateEffect",
            flight_effects_gl::register_gl_pixelate_effect,
            flight_effects_gl::contract::gl_pixelate_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_posterize_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "PosterizeEffect",
            flight_effects_gl::register_gl_posterize_effect,
            flight_effects_gl::contract::gl_posterize_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_radial_blur_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "RadialBlurEffect",
            flight_effects_gl::register_gl_radial_blur_effect,
            flight_effects_gl::contract::gl_radial_blur_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_scanlines_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "ScanlinesEffect",
            flight_effects_gl::register_gl_scanlines_effect,
            flight_effects_gl::contract::gl_scanlines_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_screen_space_fog_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "ScreenSpaceFogEffect",
            flight_effects_gl::register_gl_screen_space_fog_effect,
            flight_effects_gl::contract::gl_screen_space_fog_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_sharpen_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "SharpenEffect",
            flight_effects_gl::register_gl_sharpen_effect,
            flight_effects_gl::contract::gl_sharpen_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_sketch_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "SketchEffect",
            flight_effects_gl::register_gl_sketch_effect,
            flight_effects_gl::contract::gl_sketch_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_smaa_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "SmaaEffect",
            flight_effects_gl::register_gl_smaa_effect,
            flight_effects_gl::contract::gl_smaa_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_ssao_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "SsaoEffect",
            flight_effects_gl::register_gl_ssao_effect,
            flight_effects_gl::contract::gl_ssao_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_tilt_shift_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "TiltShiftEffect",
            flight_effects_gl::register_gl_tilt_shift_effect,
            flight_effects_gl::contract::gl_tilt_shift_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_tone_map_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "ToneMapEffect",
            flight_effects_gl::register_gl_tone_map_effect,
            flight_effects_gl::contract::gl_tone_map_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_vignette_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "VignetteEffect",
            flight_effects_gl::register_gl_vignette_effect,
            flight_effects_gl::contract::gl_vignette_effect_runner,
        );
    }

    #[test]
    fn registers_the_public_white_balance_effect_runner_on_only_the_supplied_state() {
        assert_registers_only_the_supplied_state(
            "WhiteBalanceEffect",
            flight_effects_gl::register_gl_white_balance_effect,
            flight_effects_gl::contract::gl_white_balance_effect_runner,
        );
    }
}
