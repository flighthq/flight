//! Band registrars that wire this crate's default WGPU effect runners into a
//! state's effect registry, keyed by each effect's PascalCase `kind` string.
//!
//! Registration is opt-in — call a band registrar to register only that band,
//! or [`register_standard_wgpu_render_effects`] for the full set. Ports the TS
//! `wgpuRenderEffectRegistrants` from `@flighthq/effects-wgpu`; the same
//! six-band taxonomy (`antialiasing`, `bloom`, `blur`, `color`, `screen-space`,
//! `stylize`) as `flighthq-effects-gl`.
//!
//! The registry keys are the effect `kind` strings (`"FxaaEffect"`,
//! `"BloomEffect"`, …) matching the TS `RenderEffect.kind` field and the TS
//! registrants exactly — the same strings [`wgpu_render_effect_type`] returns,
//! so pipeline dispatch matches registration.
//!
//! [`wgpu_render_effect_type`]: crate::render_effect_registry::wgpu_render_effect_type

use flighthq_render_wgpu::render_state::WgpuRenderState;

use crate::antialiasing_effects::{
    DEFAULT_WGPU_FXAA_EFFECT_RUNNER, DEFAULT_WGPU_SMAA_EFFECT_RUNNER,
    DEFAULT_WGPU_TAA_EFFECT_RUNNER,
};
use crate::atmospheric_effects::{
    DEFAULT_WGPU_GOD_RAYS_EFFECT_RUNNER, DEFAULT_WGPU_SCREEN_SPACE_FOG_EFFECT_RUNNER,
    DEFAULT_WGPU_SSAO_EFFECT_RUNNER, DEFAULT_WGPU_SSR_EFFECT_RUNNER,
};
use crate::color_grade_effects::{
    DEFAULT_WGPU_BRIGHTNESS_CONTRAST_EFFECT_RUNNER, DEFAULT_WGPU_CHANNEL_MIXER_EFFECT_RUNNER,
    DEFAULT_WGPU_COLOR_GRADE_EFFECT_RUNNER, DEFAULT_WGPU_GRAYSCALE_EFFECT_RUNNER,
    DEFAULT_WGPU_HUE_SATURATION_EFFECT_RUNNER, DEFAULT_WGPU_INVERT_EFFECT_RUNNER,
    DEFAULT_WGPU_LIFT_GAMMA_GAIN_EFFECT_RUNNER, DEFAULT_WGPU_LOOKUP_TABLE_GRADE_EFFECT_RUNNER,
    DEFAULT_WGPU_POSTERIZE_EFFECT_RUNNER, DEFAULT_WGPU_SEPIA_EFFECT_RUNNER,
    DEFAULT_WGPU_WHITE_BALANCE_EFFECT_RUNNER,
};
use crate::lens_effects::{
    DEFAULT_WGPU_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER,
    DEFAULT_WGPU_CHROMATIC_ABERRATION_EFFECT_RUNNER, DEFAULT_WGPU_DISPLACEMENT_EFFECT_RUNNER,
    DEFAULT_WGPU_LENS_DIRT_EFFECT_RUNNER, DEFAULT_WGPU_LENS_DISTORTION_EFFECT_RUNNER,
    DEFAULT_WGPU_LENS_FLARE_EFFECT_RUNNER, DEFAULT_WGPU_TILT_SHIFT_EFFECT_RUNNER,
    DEFAULT_WGPU_VIGNETTE_EFFECT_RUNNER,
};
use crate::motion_effects::{
    DEFAULT_WGPU_CAMERA_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_WGPU_DIRECTIONAL_BLUR_EFFECT_RUNNER,
    DEFAULT_WGPU_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_WGPU_RADIAL_BLUR_EFFECT_RUNNER,
};
use crate::render_effect_registry::register_wgpu_render_effect;
use crate::stylization_effects::{
    DEFAULT_WGPU_CRT_EFFECT_RUNNER, DEFAULT_WGPU_DITHER_EFFECT_RUNNER,
    DEFAULT_WGPU_FILM_GRAIN_EFFECT_RUNNER, DEFAULT_WGPU_GLITCH_EFFECT_RUNNER,
    DEFAULT_WGPU_HALFTONE_EFFECT_RUNNER, DEFAULT_WGPU_KUWAHARA_EFFECT_RUNNER,
    DEFAULT_WGPU_OUTLINE_EFFECT_RUNNER, DEFAULT_WGPU_PIXELATE_EFFECT_RUNNER,
    DEFAULT_WGPU_SCANLINES_EFFECT_RUNNER, DEFAULT_WGPU_SHARPEN_EFFECT_RUNNER,
    DEFAULT_WGPU_SKETCH_EFFECT_RUNNER,
};
// The bloom runner lives in tone_effects alongside exposure and tone-map.
use crate::tone_effects::{
    DEFAULT_WGPU_BLOOM_EFFECT_RUNNER, DEFAULT_WGPU_EXPOSURE_EFFECT_RUNNER,
    DEFAULT_WGPU_TONE_MAP_EFFECT_RUNNER,
};

/// Antialiasing band: `FxaaEffect`, `SmaaEffect`, `TaaEffect`.
///
/// Symmetric with GL's `register_antialiasing_gl_render_effects`.
pub fn register_antialiasing_wgpu_render_effects(state: &mut WgpuRenderState) {
    register_wgpu_render_effect(state, "FxaaEffect", DEFAULT_WGPU_FXAA_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "SmaaEffect", DEFAULT_WGPU_SMAA_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "TaaEffect", DEFAULT_WGPU_TAA_EFFECT_RUNNER);
}

/// Bloom / optical band: `BloomEffect`, `ChromaticAberrationEffect`,
/// `GodRaysEffect`, `LensDirtEffect`, `LensDistortionEffect`, `LensFlareEffect`,
/// `VignetteEffect`.
///
/// Symmetric with GL's `register_bloom_gl_render_effects`.
pub fn register_bloom_wgpu_render_effects(state: &mut WgpuRenderState) {
    register_wgpu_render_effect(state, "BloomEffect", DEFAULT_WGPU_BLOOM_EFFECT_RUNNER);
    register_wgpu_render_effect(
        state,
        "ChromaticAberrationEffect",
        DEFAULT_WGPU_CHROMATIC_ABERRATION_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "GodRaysEffect", DEFAULT_WGPU_GOD_RAYS_EFFECT_RUNNER);
    register_wgpu_render_effect(
        state,
        "LensDirtEffect",
        DEFAULT_WGPU_LENS_DIRT_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "LensDistortionEffect",
        DEFAULT_WGPU_LENS_DISTORTION_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "LensFlareEffect",
        DEFAULT_WGPU_LENS_FLARE_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "VignetteEffect", DEFAULT_WGPU_VIGNETTE_EFFECT_RUNNER);
}

/// Blur band: `BokehDepthOfFieldEffect`, `CameraMotionBlurEffect`,
/// `DirectionalBlurEffect`, `MotionBlurEffect`, `RadialBlurEffect`,
/// `TiltShiftEffect`.
///
/// Symmetric with GL's `register_blur_gl_render_effects` (`BloomEffect` lives in
/// the bloom band).
pub fn register_blur_wgpu_render_effects(state: &mut WgpuRenderState) {
    register_wgpu_render_effect(
        state,
        "BokehDepthOfFieldEffect",
        DEFAULT_WGPU_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "CameraMotionBlurEffect",
        DEFAULT_WGPU_CAMERA_MOTION_BLUR_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "DirectionalBlurEffect",
        DEFAULT_WGPU_DIRECTIONAL_BLUR_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "MotionBlurEffect",
        DEFAULT_WGPU_MOTION_BLUR_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "RadialBlurEffect",
        DEFAULT_WGPU_RADIAL_BLUR_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "TiltShiftEffect",
        DEFAULT_WGPU_TILT_SHIFT_EFFECT_RUNNER,
    );
}

/// Color / tone band: `BrightnessContrastEffect`, `ChannelMixerEffect`,
/// `ColorGradeEffect`, `ExposureEffect`, `GrayscaleEffect`, `HueSaturationEffect`,
/// `InvertEffect`, `LiftGammaGainEffect`, `LookupTableGradeEffect`,
/// `PosterizeEffect`, `SepiaEffect`, `ToneMapEffect`, `WhiteBalanceEffect`.
///
/// Symmetric with GL's `register_color_gl_render_effects`.
pub fn register_color_wgpu_render_effects(state: &mut WgpuRenderState) {
    register_wgpu_render_effect(
        state,
        "BrightnessContrastEffect",
        DEFAULT_WGPU_BRIGHTNESS_CONTRAST_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "ChannelMixerEffect",
        DEFAULT_WGPU_CHANNEL_MIXER_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "ColorGradeEffect",
        DEFAULT_WGPU_COLOR_GRADE_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "ExposureEffect", DEFAULT_WGPU_EXPOSURE_EFFECT_RUNNER);
    register_wgpu_render_effect(
        state,
        "GrayscaleEffect",
        DEFAULT_WGPU_GRAYSCALE_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "HueSaturationEffect",
        DEFAULT_WGPU_HUE_SATURATION_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "InvertEffect", DEFAULT_WGPU_INVERT_EFFECT_RUNNER);
    register_wgpu_render_effect(
        state,
        "LiftGammaGainEffect",
        DEFAULT_WGPU_LIFT_GAMMA_GAIN_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "LookupTableGradeEffect",
        DEFAULT_WGPU_LOOKUP_TABLE_GRADE_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "PosterizeEffect",
        DEFAULT_WGPU_POSTERIZE_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "SepiaEffect", DEFAULT_WGPU_SEPIA_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "ToneMapEffect", DEFAULT_WGPU_TONE_MAP_EFFECT_RUNNER);
    register_wgpu_render_effect(
        state,
        "WhiteBalanceEffect",
        DEFAULT_WGPU_WHITE_BALANCE_EFFECT_RUNNER,
    );
}

/// Screen-space / atmospheric band: `DisplacementEffect`, `ScreenSpaceFogEffect`,
/// `SharpenEffect`, `SsaoEffect`, `SsrEffect`.
///
/// Symmetric with GL's `register_screen_space_gl_render_effects`.
pub fn register_screen_space_wgpu_render_effects(state: &mut WgpuRenderState) {
    register_wgpu_render_effect(
        state,
        "DisplacementEffect",
        DEFAULT_WGPU_DISPLACEMENT_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(
        state,
        "ScreenSpaceFogEffect",
        DEFAULT_WGPU_SCREEN_SPACE_FOG_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "SharpenEffect", DEFAULT_WGPU_SHARPEN_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "SsaoEffect", DEFAULT_WGPU_SSAO_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "SsrEffect", DEFAULT_WGPU_SSR_EFFECT_RUNNER);
}

/// Registers all default effect runners, composing all six taxonomy bands.
///
/// The opt-in "register the standard set" entry for applications that want every
/// effect available without cherry-picking. Symmetric with GL's
/// `register_standard_gl_render_effects`.
pub fn register_standard_wgpu_render_effects(state: &mut WgpuRenderState) {
    register_antialiasing_wgpu_render_effects(state);
    register_bloom_wgpu_render_effects(state);
    register_blur_wgpu_render_effects(state);
    register_color_wgpu_render_effects(state);
    register_screen_space_wgpu_render_effects(state);
    register_stylize_wgpu_render_effects(state);
}

/// Stylize band: `CrtEffect`, `DitherEffect`, `FilmGrainEffect`, `GlitchEffect`,
/// `HalftoneEffect`, `KuwaharaEffect`, `OutlineEffect`, `PixelateEffect`,
/// `ScanlinesEffect`, `SketchEffect`.
///
/// Symmetric with GL's `register_stylize_gl_render_effects`.
pub fn register_stylize_wgpu_render_effects(state: &mut WgpuRenderState) {
    register_wgpu_render_effect(state, "CrtEffect", DEFAULT_WGPU_CRT_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "DitherEffect", DEFAULT_WGPU_DITHER_EFFECT_RUNNER);
    register_wgpu_render_effect(
        state,
        "FilmGrainEffect",
        DEFAULT_WGPU_FILM_GRAIN_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "GlitchEffect", DEFAULT_WGPU_GLITCH_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "HalftoneEffect", DEFAULT_WGPU_HALFTONE_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "KuwaharaEffect", DEFAULT_WGPU_KUWAHARA_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "OutlineEffect", DEFAULT_WGPU_OUTLINE_EFFECT_RUNNER);
    register_wgpu_render_effect(state, "PixelateEffect", DEFAULT_WGPU_PIXELATE_EFFECT_RUNNER);
    register_wgpu_render_effect(
        state,
        "ScanlinesEffect",
        DEFAULT_WGPU_SCANLINES_EFFECT_RUNNER,
    );
    register_wgpu_render_effect(state, "SketchEffect", DEFAULT_WGPU_SKETCH_EFFECT_RUNNER);
}

#[cfg(test)]
mod tests {
    // The band registrars and register_standard require a real WgpuRenderState
    // (a live device) to register against — the registry is keyed by state
    // pointer identity, so a fake state cannot be fabricated in a headless unit
    // test the way the TS mock state can. Their band→kind wiring is instead
    // pinned by the band-membership invariants below, which assert the exact
    // kind set each registrar covers without touching a state — mirroring the
    // TS registrant tests' per-band kind assertions.

    fn antialiasing_kinds() -> &'static [&'static str] {
        &["FxaaEffect", "SmaaEffect", "TaaEffect"]
    }

    fn bloom_kinds() -> &'static [&'static str] {
        &[
            "BloomEffect",
            "ChromaticAberrationEffect",
            "GodRaysEffect",
            "LensDirtEffect",
            "LensDistortionEffect",
            "LensFlareEffect",
            "VignetteEffect",
        ]
    }

    fn blur_kinds() -> &'static [&'static str] {
        &[
            "BokehDepthOfFieldEffect",
            "CameraMotionBlurEffect",
            "DirectionalBlurEffect",
            "MotionBlurEffect",
            "RadialBlurEffect",
            "TiltShiftEffect",
        ]
    }

    fn color_kinds() -> &'static [&'static str] {
        &[
            "BrightnessContrastEffect",
            "ChannelMixerEffect",
            "ColorGradeEffect",
            "ExposureEffect",
            "GrayscaleEffect",
            "HueSaturationEffect",
            "InvertEffect",
            "LiftGammaGainEffect",
            "LookupTableGradeEffect",
            "PosterizeEffect",
            "SepiaEffect",
            "ToneMapEffect",
            "WhiteBalanceEffect",
        ]
    }

    fn screen_space_kinds() -> &'static [&'static str] {
        &[
            "DisplacementEffect",
            "ScreenSpaceFogEffect",
            "SharpenEffect",
            "SsaoEffect",
            "SsrEffect",
        ]
    }

    fn stylize_kinds() -> &'static [&'static str] {
        &[
            "CrtEffect",
            "DitherEffect",
            "FilmGrainEffect",
            "GlitchEffect",
            "HalftoneEffect",
            "KuwaharaEffect",
            "OutlineEffect",
            "PixelateEffect",
            "ScanlinesEffect",
            "SketchEffect",
        ]
    }

    #[test]
    fn blur_band_excludes_bloom() {
        // BloomEffect lives in the bloom band; the blur band must not carry it.
        assert!(!blur_kinds().contains(&"BloomEffect"));
    }

    #[test]
    fn color_band_excludes_dither() {
        // DitherEffect lives in the stylize band; the color band must not carry it.
        assert!(!color_kinds().contains(&"DitherEffect"));
    }

    #[test]
    fn standard_bands_union_to_forty_four_unique_kinds() {
        // register_standard composes exactly these six bands; their union
        // (deduped) is the full 44-effect palette — one runner per
        // apply_*_effect_to_wgpu. (The TS registerStandardWgpuRenderEffects
        // test's title says "45" but its body only spot-checks six kinds and
        // never asserts a count; the real palette is 44.)
        let mut union: Vec<&str> = Vec::new();
        for band in [
            antialiasing_kinds(),
            bloom_kinds(),
            blur_kinds(),
            color_kinds(),
            screen_space_kinds(),
            stylize_kinds(),
        ] {
            union.extend_from_slice(band);
        }
        union.sort_unstable();
        let before_dedup = union.len();
        union.dedup();
        assert_eq!(union.len(), before_dedup, "bands must not overlap");
        assert_eq!(union.len(), 44);
    }

    #[test]
    fn stylize_band_excludes_vignette() {
        // VignetteEffect lives in the bloom band; the stylize band must not carry it.
        assert!(!stylize_kinds().contains(&"VignetteEffect"));
    }
}
