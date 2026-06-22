//! Color-grading effect constructors.
//!
//! Each effect is plain data with a discriminant carried by the [`RenderEffect`]
//! enum.  Packed RGBA integer fields (`lift`, `gamma`, `gain`, `color`) are
//! unpacked to normalized floats by per-backend recipe code.
//!
//! [`RenderEffect`]: crate::types::RenderEffect

use crate::types::{
    BrightnessContrastEffect, ChannelMixerEffect, ColorGradeEffect, GrayscaleEffect,
    HueSaturationEffect, InvertEffect, LiftGammaGainEffect, LookupTableGradeEffect, PosterizeEffect,
    SepiaEffect, WhiteBalanceEffect,
};

/// Returns a new [`BrightnessContrastEffect`] with the given options.
pub fn create_brightness_contrast_effect(
    options: BrightnessContrastEffect,
) -> BrightnessContrastEffect {
    options
}

/// Returns a new [`ChannelMixerEffect`] with the provided 3×4 channel-mix
/// matrix.  The matrix has exactly 12 elements in row-major order.
pub fn create_channel_mixer_effect(options: ChannelMixerEffect) -> ChannelMixerEffect {
    options
}

/// Returns a new [`ColorGradeEffect`] with the given options.
pub fn create_color_grade_effect(options: ColorGradeEffect) -> ColorGradeEffect {
    options
}

/// Returns a new [`GrayscaleEffect`] with the given options.
pub fn create_grayscale_effect(options: GrayscaleEffect) -> GrayscaleEffect {
    options
}

/// Returns a new [`HueSaturationEffect`] with the given options.
pub fn create_hue_saturation_effect(options: HueSaturationEffect) -> HueSaturationEffect {
    options
}

/// Returns a new [`InvertEffect`] with the given options.
pub fn create_invert_effect(options: InvertEffect) -> InvertEffect {
    options
}

/// Returns a new [`LiftGammaGainEffect`] with the given options.
/// Color channels are packed RGBA integers; neutral values:
/// lift `0x000000ff`, gamma `0x808080ff`, gain `0xffffffff`.
pub fn create_lift_gamma_gain_effect(options: LiftGammaGainEffect) -> LiftGammaGainEffect {
    options
}

/// Returns a new [`LookupTableGradeEffect`] with the given options.
pub fn create_lookup_table_grade_effect(options: LookupTableGradeEffect) -> LookupTableGradeEffect {
    options
}

/// Returns a new [`PosterizeEffect`] with the given options.
pub fn create_posterize_effect(options: PosterizeEffect) -> PosterizeEffect {
    options
}

/// Returns a new [`SepiaEffect`] with the given options.
pub fn create_sepia_effect(options: SepiaEffect) -> SepiaEffect {
    options
}

/// Returns a new [`WhiteBalanceEffect`] with the given options.
pub fn create_white_balance_effect(options: WhiteBalanceEffect) -> WhiteBalanceEffect {
    options
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_brightness_contrast_effect_returns_descriptor() {
        let effect = create_brightness_contrast_effect(BrightnessContrastEffect {
            brightness: Some(0.2),
            contrast: Some(1.5),
        });
        assert_eq!(effect.brightness, Some(0.2));
        assert_eq!(effect.contrast, Some(1.5));
    }

    #[test]
    fn create_channel_mixer_effect_returns_descriptor() {
        let matrix = [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0,
        ];
        let effect = create_channel_mixer_effect(ChannelMixerEffect { matrix });
        assert_eq!(effect.matrix, matrix);
    }

    #[test]
    fn create_color_grade_effect_returns_descriptor() {
        let effect = create_color_grade_effect(ColorGradeEffect {
            exposure: Some(1.0),
            saturation: Some(1.2),
            ..Default::default()
        });
        assert_eq!(effect.exposure, Some(1.0));
        assert_eq!(effect.saturation, Some(1.2));
    }

    #[test]
    fn create_grayscale_effect_returns_descriptor() {
        let effect = create_grayscale_effect(GrayscaleEffect {
            intensity: Some(0.5),
        });
        assert_eq!(effect.intensity, Some(0.5));
    }

    #[test]
    fn create_hue_saturation_effect_returns_descriptor() {
        let effect = create_hue_saturation_effect(HueSaturationEffect {
            hue: Some(90.0),
            saturation: Some(1.4),
            lightness: Some(0.1),
        });
        assert_eq!(effect.hue, Some(90.0));
        assert_eq!(effect.saturation, Some(1.4));
        assert_eq!(effect.lightness, Some(0.1));
    }

    #[test]
    fn create_invert_effect_returns_descriptor() {
        let effect = create_invert_effect(InvertEffect {
            intensity: Some(0.75),
        });
        assert_eq!(effect.intensity, Some(0.75));
    }

    #[test]
    fn create_lift_gamma_gain_effect_returns_descriptor() {
        let effect = create_lift_gamma_gain_effect(LiftGammaGainEffect {
            lift: Some(0x808080ff),
            gamma: Some(0x808080ff),
            gain: Some(0x808080ff),
        });
        assert_eq!(effect.lift, Some(0x808080ff));
        assert_eq!(effect.gamma, Some(0x808080ff));
        assert_eq!(effect.gain, Some(0x808080ff));
    }

    #[test]
    fn create_lookup_table_grade_effect_returns_descriptor() {
        let effect = create_lookup_table_grade_effect(LookupTableGradeEffect {
            size: Some(32),
            strength: Some(0.8),
        });
        assert_eq!(effect.size, Some(32));
        assert_eq!(effect.strength, Some(0.8));
    }

    #[test]
    fn create_posterize_effect_returns_descriptor() {
        let effect = create_posterize_effect(PosterizeEffect { levels: Some(4) });
        assert_eq!(effect.levels, Some(4));
    }

    #[test]
    fn create_sepia_effect_returns_descriptor() {
        let effect = create_sepia_effect(SepiaEffect {
            intensity: Some(0.6),
        });
        assert_eq!(effect.intensity, Some(0.6));
    }

    #[test]
    fn create_white_balance_effect_returns_descriptor() {
        let effect = create_white_balance_effect(WhiteBalanceEffect {
            temperature: Some(0.3),
            tint: Some(-0.2),
        });
        assert_eq!(effect.temperature, Some(0.3));
        assert_eq!(effect.tint, Some(-0.2));
    }
}
