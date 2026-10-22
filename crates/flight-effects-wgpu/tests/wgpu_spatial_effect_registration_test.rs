use flight_render_wgpu::{WgpuEffectRunner, WgpuRenderState};

use crate::support::*;

type Registration = (&'static str, fn(&mut WgpuRenderState), WgpuEffectRunner);

fn registrations() -> Vec<Registration> {
    return vec![
        (
            "BevelEffect",
            flight_effects_wgpu::register_wgpu_bevel_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_bevel_effect_runner as WgpuEffectRunner,
        ),
        (
            "BitmapDisplacementEffect",
            flight_effects_wgpu::register_wgpu_bitmap_displacement_effect
                as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_bitmap_displacement_effect_runner
                as WgpuEffectRunner,
        ),
        (
            "BlendEffect",
            flight_effects_wgpu::register_wgpu_blend_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_blend_effect_runner as WgpuEffectRunner,
        ),
        (
            "BloomEffect",
            flight_effects_wgpu::register_wgpu_bloom_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_bloom_effect_runner as WgpuEffectRunner,
        ),
        (
            "BlurEffect",
            flight_effects_wgpu::register_wgpu_blur_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_blur_effect_runner as WgpuEffectRunner,
        ),
        (
            "CameraMotionBlurEffect",
            flight_effects_wgpu::register_wgpu_camera_motion_blur_effect
                as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_camera_motion_blur_effect_runner
                as WgpuEffectRunner,
        ),
        (
            "ChromaticAberrationEffect",
            flight_effects_wgpu::register_wgpu_chromatic_aberration_effect
                as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_chromatic_aberration_effect_runner
                as WgpuEffectRunner,
        ),
        (
            "CompositeEffect",
            flight_effects_wgpu::register_wgpu_composite_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_composite_effect_runner as WgpuEffectRunner,
        ),
        (
            "ContactShadowsEffect",
            flight_effects_wgpu::register_wgpu_contact_shadows_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_contact_shadows_effect_runner as WgpuEffectRunner,
        ),
        (
            "ConvolutionEffect",
            flight_effects_wgpu::register_wgpu_convolution_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_convolution_effect_runner as WgpuEffectRunner,
        ),
        (
            "CrtEffect",
            flight_effects_wgpu::register_wgpu_crt_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_crt_effect_runner as WgpuEffectRunner,
        ),
        (
            "DirectionalBlurEffect",
            flight_effects_wgpu::register_wgpu_directional_blur_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_directional_blur_effect_runner as WgpuEffectRunner,
        ),
        (
            "DisplacementEffect",
            flight_effects_wgpu::register_wgpu_displacement_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_displacement_effect_runner as WgpuEffectRunner,
        ),
        (
            "DitherEffect",
            flight_effects_wgpu::register_wgpu_dither_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_dither_effect_runner as WgpuEffectRunner,
        ),
        (
            "DropShadowEffect",
            flight_effects_wgpu::register_wgpu_drop_shadow_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_drop_shadow_effect_runner as WgpuEffectRunner,
        ),
        (
            "FilmGrainEffect",
            flight_effects_wgpu::register_wgpu_film_grain_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_film_grain_effect_runner as WgpuEffectRunner,
        ),
        (
            "FxaaEffect",
            flight_effects_wgpu::register_wgpu_fxaa_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_fxaa_effect_runner as WgpuEffectRunner,
        ),
        (
            "GlitchEffect",
            flight_effects_wgpu::register_wgpu_glitch_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_glitch_effect_runner as WgpuEffectRunner,
        ),
        (
            "GodRaysEffect",
            flight_effects_wgpu::register_wgpu_god_rays_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_god_rays_effect_runner as WgpuEffectRunner,
        ),
        (
            "GradientBevelEffect",
            flight_effects_wgpu::register_wgpu_gradient_bevel_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_gradient_bevel_effect_runner as WgpuEffectRunner,
        ),
        (
            "GradientGlowEffect",
            flight_effects_wgpu::register_wgpu_gradient_glow_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_gradient_glow_effect_runner as WgpuEffectRunner,
        ),
        (
            "HalftoneEffect",
            flight_effects_wgpu::register_wgpu_halftone_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_halftone_effect_runner as WgpuEffectRunner,
        ),
        (
            "InnerGlowEffect",
            flight_effects_wgpu::register_wgpu_inner_glow_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_inner_glow_effect_runner as WgpuEffectRunner,
        ),
        (
            "InnerShadowEffect",
            flight_effects_wgpu::register_wgpu_inner_shadow_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_inner_shadow_effect_runner as WgpuEffectRunner,
        ),
        (
            "KuwaharaEffect",
            flight_effects_wgpu::register_wgpu_kuwahara_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_kuwahara_effect_runner as WgpuEffectRunner,
        ),
        (
            "LensDirtEffect",
            flight_effects_wgpu::register_wgpu_lens_dirt_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_lens_dirt_effect_runner as WgpuEffectRunner,
        ),
        (
            "LensDistortionEffect",
            flight_effects_wgpu::register_wgpu_lens_distortion_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_lens_distortion_effect_runner as WgpuEffectRunner,
        ),
        (
            "LensFlareEffect",
            flight_effects_wgpu::register_wgpu_lens_flare_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_lens_flare_effect_runner as WgpuEffectRunner,
        ),
        (
            "MedianEffect",
            flight_effects_wgpu::register_wgpu_median_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_median_effect_runner as WgpuEffectRunner,
        ),
        (
            "MotionBlurEffect",
            flight_effects_wgpu::register_wgpu_motion_blur_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_motion_blur_effect_runner as WgpuEffectRunner,
        ),
        (
            "OuterGlowEffect",
            flight_effects_wgpu::register_wgpu_outer_glow_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_outer_glow_effect_runner as WgpuEffectRunner,
        ),
        (
            "OutlineEffect",
            flight_effects_wgpu::register_wgpu_outline_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_outline_effect_runner as WgpuEffectRunner,
        ),
        (
            "PixelateEffect",
            flight_effects_wgpu::register_wgpu_pixelate_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_pixelate_effect_runner as WgpuEffectRunner,
        ),
        (
            "PosterizeEffect",
            flight_effects_wgpu::register_wgpu_posterize_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_posterize_effect_runner as WgpuEffectRunner,
        ),
        (
            "RadialBlurEffect",
            flight_effects_wgpu::register_wgpu_radial_blur_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_radial_blur_effect_runner as WgpuEffectRunner,
        ),
        (
            "ScanlinesEffect",
            flight_effects_wgpu::register_wgpu_scanlines_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_scanlines_effect_runner as WgpuEffectRunner,
        ),
        (
            "ScreenSpaceFogEffect",
            flight_effects_wgpu::register_wgpu_screen_space_fog_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_screen_space_fog_effect_runner as WgpuEffectRunner,
        ),
        (
            "SharpenEffect",
            flight_effects_wgpu::register_wgpu_sharpen_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_sharpen_effect_runner as WgpuEffectRunner,
        ),
        (
            "SketchEffect",
            flight_effects_wgpu::register_wgpu_sketch_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_sketch_effect_runner as WgpuEffectRunner,
        ),
        (
            "SmaaEffect",
            flight_effects_wgpu::register_wgpu_smaa_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_smaa_effect_runner as WgpuEffectRunner,
        ),
        (
            "SsaoEffect",
            flight_effects_wgpu::register_wgpu_ssao_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_ssao_effect_runner as WgpuEffectRunner,
        ),
        (
            "TiltShiftEffect",
            flight_effects_wgpu::register_wgpu_tilt_shift_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_tilt_shift_effect_runner as WgpuEffectRunner,
        ),
        (
            "ToneMapEffect",
            flight_effects_wgpu::register_wgpu_tone_map_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_tone_map_effect_runner as WgpuEffectRunner,
        ),
        (
            "VignetteEffect",
            flight_effects_wgpu::register_wgpu_vignette_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_vignette_effect_runner as WgpuEffectRunner,
        ),
        (
            "WhiteBalanceEffect",
            flight_effects_wgpu::register_wgpu_white_balance_effect as fn(&mut WgpuRenderState),
            flight_effects_wgpu::contract::wgpu_white_balance_effect_runner as WgpuEffectRunner,
        ),
    ];
}

mod wgpu_effect_registration {
    use super::*;

    // Each public registrar installs the contract lane's runner for its kind on the supplied state
    // only.
    #[test]
    fn registers_the_public_runner_on_only_the_supplied_state() {
        for (kind, register, runner) in registrations() {
            let mut state = create_wgpu_render_state_for_test(None);
            let other = create_wgpu_render_state_for_test(None);

            register(&mut state);

            assert!(
                flight_effects_wgpu::get_wgpu_effect_runner(&state, kind)
                    .is_some_and(|registered| std::ptr::fn_addr_eq(registered, runner)),
                "{kind}"
            );
            assert!(
                flight_effects_wgpu::get_wgpu_effect_runner(&other, kind).is_none(),
                "{kind}"
            );
        }
    }
}
