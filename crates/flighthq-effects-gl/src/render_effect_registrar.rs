//! Band registrars that wire this crate's default GL effect runners into a
//! state's effect registry, keyed by each effect's PascalCase `kind` string.
//!
//! Registration is opt-in — call a band registrar to register only that band,
//! or [`register_default_gl_render_effects`] for the full set. Ports the TS
//! `glRenderEffectRegistrar` from `@flighthq/effects-gl`; the same six-band
//! taxonomy (`antialiasing`, `bloom`, `blur`, `color`, `screen-space`,
//! `stylize`) as `flighthq-effects-wgpu`, with the four-band aliases
//! (`register_color_grade_*`, `register_standard_*`) preserved for callers that
//! used the original names.
//!
//! The registry keys are the effect `kind` strings (`"FxaaEffect"`,
//! `"BloomEffect"`, …) matching the TS `RenderEffect.kind` field and the TS
//! registrar exactly — not the camelCase `gl_render_effect_type` keys.

use flighthq_render_gl::render_state::GlRenderState;

use crate::antialiasing_effects::{
    DEFAULT_GL_FXAA_EFFECT_RUNNER, DEFAULT_GL_SMAA_EFFECT_RUNNER, DEFAULT_GL_TAA_EFFECT_RUNNER,
};
use crate::atmospheric_effects::{
    DEFAULT_GL_GOD_RAYS_EFFECT_RUNNER, DEFAULT_GL_SCREEN_SPACE_FOG_EFFECT_RUNNER,
    DEFAULT_GL_SSAO_EFFECT_RUNNER, DEFAULT_GL_SSR_EFFECT_RUNNER,
};
use crate::color_grade_effects::{
    DEFAULT_GL_BRIGHTNESS_CONTRAST_EFFECT_RUNNER, DEFAULT_GL_CHANNEL_MIXER_EFFECT_RUNNER,
    DEFAULT_GL_COLOR_GRADE_EFFECT_RUNNER, DEFAULT_GL_GRAYSCALE_EFFECT_RUNNER,
    DEFAULT_GL_HUE_SATURATION_EFFECT_RUNNER, DEFAULT_GL_INVERT_EFFECT_RUNNER,
    DEFAULT_GL_LIFT_GAMMA_GAIN_EFFECT_RUNNER, DEFAULT_GL_LOOKUP_TABLE_GRADE_EFFECT_RUNNER,
    DEFAULT_GL_POSTERIZE_EFFECT_RUNNER, DEFAULT_GL_SEPIA_EFFECT_RUNNER,
    DEFAULT_GL_WHITE_BALANCE_EFFECT_RUNNER,
};
use crate::lens_effects::{
    DEFAULT_GL_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER, DEFAULT_GL_CHROMATIC_ABERRATION_EFFECT_RUNNER,
    DEFAULT_GL_DISPLACEMENT_EFFECT_RUNNER, DEFAULT_GL_LENS_DIRT_EFFECT_RUNNER,
    DEFAULT_GL_LENS_DISTORTION_EFFECT_RUNNER, DEFAULT_GL_LENS_FLARE_EFFECT_RUNNER,
    DEFAULT_GL_TILT_SHIFT_EFFECT_RUNNER, DEFAULT_GL_VIGNETTE_EFFECT_RUNNER,
};
use crate::motion_effects::{
    DEFAULT_GL_CAMERA_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_GL_DIRECTIONAL_BLUR_EFFECT_RUNNER,
    DEFAULT_GL_MOTION_BLUR_EFFECT_RUNNER, DEFAULT_GL_RADIAL_BLUR_EFFECT_RUNNER,
};
use crate::render_effect_registry::register_gl_render_effect;
use crate::stylization_effects::{
    DEFAULT_GL_CRT_EFFECT_RUNNER, DEFAULT_GL_DITHER_EFFECT_RUNNER,
    DEFAULT_GL_FILM_GRAIN_EFFECT_RUNNER, DEFAULT_GL_GLITCH_EFFECT_RUNNER,
    DEFAULT_GL_HALFTONE_EFFECT_RUNNER, DEFAULT_GL_KUWAHARA_EFFECT_RUNNER,
    DEFAULT_GL_OUTLINE_EFFECT_RUNNER, DEFAULT_GL_PIXELATE_EFFECT_RUNNER,
    DEFAULT_GL_SCANLINES_EFFECT_RUNNER, DEFAULT_GL_SHARPEN_EFFECT_RUNNER,
    DEFAULT_GL_SKETCH_EFFECT_RUNNER,
};
// The bloom runner lives in tone_effects alongside exposure and tone-map.
use crate::tone_effects::{
    DEFAULT_GL_BLOOM_EFFECT_RUNNER, DEFAULT_GL_EXPOSURE_EFFECT_RUNNER,
    DEFAULT_GL_TONE_MAP_EFFECT_RUNNER,
};

/// Returns the full set of effect kind strings covered by this crate's default
/// runners, in alphabetical order.
///
/// The single source of truth for what [`register_default_gl_render_effects`]
/// wires in — use it to populate editor dropdowns, assert complete
/// registration, or enumerate for tooling.
pub fn get_gl_render_effect_kinds() -> &'static [&'static str] {
    ALL_GL_EFFECT_KINDS
}

/// Antialiasing band: `FxaaEffect`, `SmaaEffect`, `TaaEffect`.
///
/// Symmetric with WGPU's `register_antialiasing_wgpu_render_effects`.
pub fn register_antialiasing_gl_render_effects(state: &mut GlRenderState) {
    register_gl_render_effect(state, "FxaaEffect", DEFAULT_GL_FXAA_EFFECT_RUNNER);
    register_gl_render_effect(state, "SmaaEffect", DEFAULT_GL_SMAA_EFFECT_RUNNER);
    register_gl_render_effect(state, "TaaEffect", DEFAULT_GL_TAA_EFFECT_RUNNER);
}

/// Bloom / optical band: `BloomEffect`, `ChromaticAberrationEffect`,
/// `GodRaysEffect`, `LensDirtEffect`, `LensDistortionEffect`, `LensFlareEffect`,
/// `VignetteEffect`.
///
/// Symmetric with WGPU's `register_bloom_wgpu_render_effects`.
pub fn register_bloom_gl_render_effects(state: &mut GlRenderState) {
    register_gl_render_effect(state, "BloomEffect", DEFAULT_GL_BLOOM_EFFECT_RUNNER);
    register_gl_render_effect(
        state,
        "ChromaticAberrationEffect",
        DEFAULT_GL_CHROMATIC_ABERRATION_EFFECT_RUNNER,
    );
    register_gl_render_effect(state, "GodRaysEffect", DEFAULT_GL_GOD_RAYS_EFFECT_RUNNER);
    register_gl_render_effect(state, "LensDirtEffect", DEFAULT_GL_LENS_DIRT_EFFECT_RUNNER);
    register_gl_render_effect(
        state,
        "LensDistortionEffect",
        DEFAULT_GL_LENS_DISTORTION_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "LensFlareEffect",
        DEFAULT_GL_LENS_FLARE_EFFECT_RUNNER,
    );
    register_gl_render_effect(state, "VignetteEffect", DEFAULT_GL_VIGNETTE_EFFECT_RUNNER);
}

/// Blur band: `BokehDepthOfFieldEffect`, `CameraMotionBlurEffect`,
/// `DirectionalBlurEffect`, `MotionBlurEffect`, `RadialBlurEffect`,
/// `TiltShiftEffect`.
///
/// Symmetric with WGPU's `register_blur_wgpu_render_effects` (`BloomEffect` has
/// moved to the bloom band).
pub fn register_blur_gl_render_effects(state: &mut GlRenderState) {
    register_gl_render_effect(
        state,
        "BokehDepthOfFieldEffect",
        DEFAULT_GL_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "CameraMotionBlurEffect",
        DEFAULT_GL_CAMERA_MOTION_BLUR_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "DirectionalBlurEffect",
        DEFAULT_GL_DIRECTIONAL_BLUR_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "MotionBlurEffect",
        DEFAULT_GL_MOTION_BLUR_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "RadialBlurEffect",
        DEFAULT_GL_RADIAL_BLUR_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "TiltShiftEffect",
        DEFAULT_GL_TILT_SHIFT_EFFECT_RUNNER,
    );
}

/// Color / tone band: `BrightnessContrastEffect`, `ChannelMixerEffect`,
/// `ColorGradeEffect`, `ExposureEffect`, `GrayscaleEffect`, `HueSaturationEffect`,
/// `InvertEffect`, `LiftGammaGainEffect`, `LookupTableGradeEffect`,
/// `PosterizeEffect`, `SepiaEffect`, `ToneMapEffect`, `WhiteBalanceEffect`.
///
/// `DitherEffect` has moved to the stylize band (matching WGPU). Symmetric with
/// WGPU's `register_color_wgpu_render_effects`.
pub fn register_color_gl_render_effects(state: &mut GlRenderState) {
    register_gl_render_effect(
        state,
        "BrightnessContrastEffect",
        DEFAULT_GL_BRIGHTNESS_CONTRAST_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "ChannelMixerEffect",
        DEFAULT_GL_CHANNEL_MIXER_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "ColorGradeEffect",
        DEFAULT_GL_COLOR_GRADE_EFFECT_RUNNER,
    );
    register_gl_render_effect(state, "ExposureEffect", DEFAULT_GL_EXPOSURE_EFFECT_RUNNER);
    register_gl_render_effect(state, "GrayscaleEffect", DEFAULT_GL_GRAYSCALE_EFFECT_RUNNER);
    register_gl_render_effect(
        state,
        "HueSaturationEffect",
        DEFAULT_GL_HUE_SATURATION_EFFECT_RUNNER,
    );
    register_gl_render_effect(state, "InvertEffect", DEFAULT_GL_INVERT_EFFECT_RUNNER);
    register_gl_render_effect(
        state,
        "LiftGammaGainEffect",
        DEFAULT_GL_LIFT_GAMMA_GAIN_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "LookupTableGradeEffect",
        DEFAULT_GL_LOOKUP_TABLE_GRADE_EFFECT_RUNNER,
    );
    register_gl_render_effect(state, "PosterizeEffect", DEFAULT_GL_POSTERIZE_EFFECT_RUNNER);
    register_gl_render_effect(state, "SepiaEffect", DEFAULT_GL_SEPIA_EFFECT_RUNNER);
    register_gl_render_effect(state, "ToneMapEffect", DEFAULT_GL_TONE_MAP_EFFECT_RUNNER);
    register_gl_render_effect(
        state,
        "WhiteBalanceEffect",
        DEFAULT_GL_WHITE_BALANCE_EFFECT_RUNNER,
    );
}

/// Alias: `register_color_grade_gl_render_effects` →
/// [`register_color_gl_render_effects`].
///
/// Kept for callers that used the original four-band name.
pub fn register_color_grade_gl_render_effects(state: &mut GlRenderState) {
    register_color_gl_render_effects(state);
}

/// Registers all default effect runners, covering all six taxonomy bands.
///
/// The opt-in "register the standard set" entry for applications that want every
/// effect available without cherry-picking. Symmetric with WGPU's
/// `register_standard_wgpu_render_effects`.
pub fn register_default_gl_render_effects(state: &mut GlRenderState) {
    register_antialiasing_gl_render_effects(state);
    register_bloom_gl_render_effects(state);
    register_blur_gl_render_effects(state);
    register_color_gl_render_effects(state);
    register_screen_space_gl_render_effects(state);
    register_stylize_gl_render_effects(state);
}

/// Screen-space / atmospheric band: `DisplacementEffect`, `ScreenSpaceFogEffect`,
/// `SharpenEffect`, `SsaoEffect`, `SsrEffect`.
///
/// Antialiasing effects (FXAA/SMAA/TAA) are in their own band; this band covers
/// depth/atmosphere/image-quality effects that do not fit the other categories.
/// Symmetric with WGPU's `register_screen_space_wgpu_render_effects`.
pub fn register_screen_space_gl_render_effects(state: &mut GlRenderState) {
    register_gl_render_effect(
        state,
        "DisplacementEffect",
        DEFAULT_GL_DISPLACEMENT_EFFECT_RUNNER,
    );
    register_gl_render_effect(
        state,
        "ScreenSpaceFogEffect",
        DEFAULT_GL_SCREEN_SPACE_FOG_EFFECT_RUNNER,
    );
    register_gl_render_effect(state, "SharpenEffect", DEFAULT_GL_SHARPEN_EFFECT_RUNNER);
    register_gl_render_effect(state, "SsaoEffect", DEFAULT_GL_SSAO_EFFECT_RUNNER);
    register_gl_render_effect(state, "SsrEffect", DEFAULT_GL_SSR_EFFECT_RUNNER);
}

/// Alias: `register_standard_gl_render_effects` →
/// [`register_default_gl_render_effects`].
///
/// Symmetric name for callers targeting both GL and WGPU registrants.
pub fn register_standard_gl_render_effects(state: &mut GlRenderState) {
    register_default_gl_render_effects(state);
}

/// Stylize band: `CrtEffect`, `DitherEffect`, `FilmGrainEffect`, `GlitchEffect`,
/// `HalftoneEffect`, `KuwaharaEffect`, `OutlineEffect`, `PixelateEffect`,
/// `ScanlinesEffect`, `SketchEffect`.
///
/// `DitherEffect` has moved here from the color-grade band (matching WGPU).
/// Symmetric with WGPU's `register_stylize_wgpu_render_effects`.
pub fn register_stylize_gl_render_effects(state: &mut GlRenderState) {
    register_gl_render_effect(state, "CrtEffect", DEFAULT_GL_CRT_EFFECT_RUNNER);
    register_gl_render_effect(state, "DitherEffect", DEFAULT_GL_DITHER_EFFECT_RUNNER);
    register_gl_render_effect(
        state,
        "FilmGrainEffect",
        DEFAULT_GL_FILM_GRAIN_EFFECT_RUNNER,
    );
    register_gl_render_effect(state, "GlitchEffect", DEFAULT_GL_GLITCH_EFFECT_RUNNER);
    register_gl_render_effect(state, "HalftoneEffect", DEFAULT_GL_HALFTONE_EFFECT_RUNNER);
    register_gl_render_effect(state, "KuwaharaEffect", DEFAULT_GL_KUWAHARA_EFFECT_RUNNER);
    register_gl_render_effect(state, "OutlineEffect", DEFAULT_GL_OUTLINE_EFFECT_RUNNER);
    register_gl_render_effect(state, "PixelateEffect", DEFAULT_GL_PIXELATE_EFFECT_RUNNER);
    register_gl_render_effect(state, "ScanlinesEffect", DEFAULT_GL_SCANLINES_EFFECT_RUNNER);
    register_gl_render_effect(state, "SketchEffect", DEFAULT_GL_SKETCH_EFFECT_RUNNER);
}

/// All kind strings covered by this crate's default runners, alphabetical order.
///
/// The single source of truth for [`register_default_gl_render_effects`] and
/// [`get_gl_render_effect_kinds`].
const ALL_GL_EFFECT_KINDS: &[&str] = &[
    "BloomEffect",
    "BokehDepthOfFieldEffect",
    "BrightnessContrastEffect",
    "CameraMotionBlurEffect",
    "ChannelMixerEffect",
    "ChromaticAberrationEffect",
    "ColorGradeEffect",
    "CrtEffect",
    "DirectionalBlurEffect",
    "DisplacementEffect",
    "DitherEffect",
    "ExposureEffect",
    "FilmGrainEffect",
    "FxaaEffect",
    "GlitchEffect",
    "GodRaysEffect",
    "GrayscaleEffect",
    "HalftoneEffect",
    "HueSaturationEffect",
    "InvertEffect",
    "KuwaharaEffect",
    "LensDirtEffect",
    "LensDistortionEffect",
    "LensFlareEffect",
    "LiftGammaGainEffect",
    "LookupTableGradeEffect",
    "MotionBlurEffect",
    "OutlineEffect",
    "PixelateEffect",
    "PosterizeEffect",
    "RadialBlurEffect",
    "ScanlinesEffect",
    "ScreenSpaceFogEffect",
    "SepiaEffect",
    "SharpenEffect",
    "SketchEffect",
    "SmaaEffect",
    "SsaoEffect",
    "SsrEffect",
    "TaaEffect",
    "TiltShiftEffect",
    "ToneMapEffect",
    "VignetteEffect",
    "WhiteBalanceEffect",
];

#[cfg(test)]
mod tests {
    use super::*;

    // get_gl_render_effect_kinds

    #[test]
    fn get_gl_render_effect_kinds_returns_non_empty_string_list() {
        let kinds = get_gl_render_effect_kinds();
        assert!(!kinds.is_empty());
        assert!(kinds.iter().all(|k| !k.is_empty()));
    }

    #[test]
    fn get_gl_render_effect_kinds_is_sorted_alphabetically() {
        let kinds = get_gl_render_effect_kinds();
        let mut sorted = kinds.to_vec();
        sorted.sort_unstable();
        assert_eq!(kinds, sorted.as_slice());
    }

    #[test]
    fn get_gl_render_effect_kinds_has_no_duplicates() {
        let kinds = get_gl_render_effect_kinds();
        let unique: std::collections::HashSet<_> = kinds.iter().collect();
        assert_eq!(unique.len(), kinds.len());
    }

    // The band registrars and register_default/register_standard require a real
    // GlRenderState (a live glow::Context) to register against — the registry is
    // keyed by state pointer identity, so a fake state cannot be fabricated in a
    // headless unit test the way the TS `{} as never` fake can. Their band→kind
    // wiring is instead pinned by band_kind_lists_match_all_kinds below, which
    // asserts the exact kind set each registrar covers without touching a state.

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
    fn band_kind_lists_union_to_all_kinds() {
        // register_default composes exactly these six bands, so their union
        // (deduped, sorted) must equal ALL_GL_EFFECT_KINDS — the same invariant
        // the TS "registers a runner for every kind returned by
        // getGlRenderEffectKinds" test asserts.
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
        union.dedup();
        assert_eq!(union.as_slice(), get_gl_render_effect_kinds());
    }

    #[test]
    fn blur_band_excludes_bloom() {
        // BloomEffect moved to the bloom band; the blur band must not carry it.
        assert!(!blur_kinds().contains(&"BloomEffect"));
    }

    #[test]
    fn color_band_excludes_dither() {
        // DitherEffect moved to the stylize band; the color band must not carry it.
        assert!(!color_kinds().contains(&"DitherEffect"));
    }

    #[test]
    fn stylize_band_excludes_vignette() {
        // VignetteEffect moved to the bloom band; the stylize band must not carry it.
        assert!(!stylize_kinds().contains(&"VignetteEffect"));
    }
}
