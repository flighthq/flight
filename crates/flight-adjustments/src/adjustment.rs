use crate::contract::BrightnessContrastAdjustment;
use crate::contract::ChannelMixerAdjustment;
use crate::contract::ColorBlindSimulationAdjustment;
use crate::contract::ColorGradeAdjustment;
use crate::contract::ColorMatrixAdjustment;
use crate::contract::ColorScaleBiasAdjustment;
use crate::contract::ExposureAdjustment;
use crate::contract::GrayscaleAdjustment;
use crate::contract::HueSaturationAdjustment;
use crate::contract::InvertAdjustment;
use crate::contract::LiftGammaGainAdjustment;
use crate::contract::LookupTableGradeAdjustment;
use crate::contract::SepiaAdjustment;
use crate::contract::TintAdjustment;

/// Discriminated union of all adjustment types. Replaces the TS `kind` string discriminant.
/// Matrix-tier adjustments carry a `color_matrix: [f32; 20]`. LUT-tier adjustments carry
/// parameter fields; their transform is applied via `apply_color_transform` (enum dispatch
/// replacing TS closures).
#[derive(Debug, Clone)]
pub enum Adjustment {
    BrightnessContrast(BrightnessContrastAdjustment),
    ChannelMixer(ChannelMixerAdjustment),
    ColorBlindSimulation(ColorBlindSimulationAdjustment),
    ColorGrade(ColorGradeAdjustment),
    ColorMatrix(ColorMatrixAdjustment),
    ColorScaleBias(ColorScaleBiasAdjustment),
    Exposure(ExposureAdjustment),
    Grayscale(GrayscaleAdjustment),
    HueSaturation(HueSaturationAdjustment),
    Invert(InvertAdjustment),
    LiftGammaGain(LiftGammaGainAdjustment),
    LookupTableGrade(LookupTableGradeAdjustment),
    Sepia(SepiaAdjustment),
    Tint(TintAdjustment),
}

/// Sets the kind on an adjustment. In Rust the kind is the enum variant, so this is a
/// documentation-only function that mirrors the TS `initializeAdjustment`.
pub fn initialize_adjustment(_adjustment: &Adjustment) {
    // In Rust the kind is intrinsic to the enum variant.
    // This function exists to match the TS API surface.
}

/// Returns the kind string for an adjustment, matching the TS `kind` discriminant.
pub fn get_adjustment_kind(adjustment: &Adjustment) -> &str {
    return match adjustment {
        Adjustment::BrightnessContrast(_) => "BrightnessContrastAdjustment",
        Adjustment::ChannelMixer(_) => "ChannelMixerAdjustment",
        Adjustment::ColorBlindSimulation(_) => "ColorBlindSimulationAdjustment",
        Adjustment::ColorGrade(_) => "ColorGradeAdjustment",
        Adjustment::ColorMatrix(_) => "ColorMatrixAdjustment",
        Adjustment::ColorScaleBias(_) => "ColorScaleBiasAdjustment",
        Adjustment::Exposure(_) => "ExposureAdjustment",
        Adjustment::Grayscale(_) => "GrayscaleAdjustment",
        Adjustment::HueSaturation(_) => "HueSaturationAdjustment",
        Adjustment::Invert(_) => "InvertAdjustment",
        Adjustment::LiftGammaGain(_) => "LiftGammaGainAdjustment",
        Adjustment::LookupTableGrade(_) => "LookupTableGradeAdjustment",
        Adjustment::Sepia(_) => "SepiaAdjustment",
        Adjustment::Tint(_) => "TintAdjustment",
    };
}
