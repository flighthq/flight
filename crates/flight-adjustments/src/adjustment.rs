use crate::BrightnessContrastAdjustment;
use crate::ChannelMixerAdjustment;
use crate::ColorBlindSimulationAdjustment;
use crate::ColorGradeAdjustment;
use crate::ColorLut;
use crate::ColorMatrixAdjustment;
use crate::ColorScaleBias;
use crate::ColorScaleBiasAdjustment;
use crate::ExposureAdjustment;
use crate::GrayscaleAdjustment;
use crate::HueSaturationAdjustment;
use crate::InvertAdjustment;
use crate::LiftGammaGainAdjustment;
use crate::LookupTableGradeAdjustment;
use crate::SepiaAdjustment;
use crate::TintAdjustment;

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

/// Sets the kind on an adjustment. In Rust the kind is the enum variant, so this is a
/// documentation-only function that mirrors the TS `initializeAdjustment`.
pub fn initialize_adjustment(_adjustment: &Adjustment) {
    // In Rust the kind is intrinsic to the enum variant.
    // This function exists to match the TS API surface.
}

impl From<BrightnessContrastAdjustment> for Adjustment {
    fn from(v: BrightnessContrastAdjustment) -> Self { return Adjustment::BrightnessContrast(v); }
}
impl From<ChannelMixerAdjustment> for Adjustment {
    fn from(v: ChannelMixerAdjustment) -> Self { return Adjustment::ChannelMixer(v); }
}
impl From<ColorBlindSimulationAdjustment> for Adjustment {
    fn from(v: ColorBlindSimulationAdjustment) -> Self { return Adjustment::ColorBlindSimulation(v); }
}
impl From<ColorGradeAdjustment> for Adjustment {
    fn from(v: ColorGradeAdjustment) -> Self { return Adjustment::ColorGrade(v); }
}
impl From<ColorMatrixAdjustment> for Adjustment {
    fn from(v: ColorMatrixAdjustment) -> Self { return Adjustment::ColorMatrix(v); }
}
impl From<ColorScaleBiasAdjustment> for Adjustment {
    fn from(v: ColorScaleBiasAdjustment) -> Self { return Adjustment::ColorScaleBias(v); }
}
impl From<ExposureAdjustment> for Adjustment {
    fn from(v: ExposureAdjustment) -> Self { return Adjustment::Exposure(v); }
}
impl From<GrayscaleAdjustment> for Adjustment {
    fn from(v: GrayscaleAdjustment) -> Self { return Adjustment::Grayscale(v); }
}
impl From<HueSaturationAdjustment> for Adjustment {
    fn from(v: HueSaturationAdjustment) -> Self { return Adjustment::HueSaturation(v); }
}
impl From<InvertAdjustment> for Adjustment {
    fn from(v: InvertAdjustment) -> Self { return Adjustment::Invert(v); }
}
impl From<LiftGammaGainAdjustment> for Adjustment {
    fn from(v: LiftGammaGainAdjustment) -> Self { return Adjustment::LiftGammaGain(v); }
}
impl From<LookupTableGradeAdjustment> for Adjustment {
    fn from(v: LookupTableGradeAdjustment) -> Self { return Adjustment::LookupTableGrade(v); }
}
impl From<SepiaAdjustment> for Adjustment {
    fn from(v: SepiaAdjustment) -> Self { return Adjustment::Sepia(v); }
}
impl From<TintAdjustment> for Adjustment {
    fn from(v: TintAdjustment) -> Self { return Adjustment::Tint(v); }
}
