pub type AdvancedBlendMode = String;
pub type CompositeOperator = String;

pub const ADVANCED_BLEND_MODE_COLOR: &str = "Color";
pub const ADVANCED_BLEND_MODE_COLOR_BURN: &str = "ColorBurn";
pub const ADVANCED_BLEND_MODE_COLOR_DODGE: &str = "ColorDodge";
pub const ADVANCED_BLEND_MODE_DARKEN: &str = "Darken";
pub const ADVANCED_BLEND_MODE_DIFFERENCE: &str = "Difference";
pub const ADVANCED_BLEND_MODE_EXCLUSION: &str = "Exclusion";
pub const ADVANCED_BLEND_MODE_HARD_LIGHT: &str = "HardLight";
pub const ADVANCED_BLEND_MODE_HUE: &str = "Hue";
pub const ADVANCED_BLEND_MODE_LIGHTEN: &str = "Lighten";
pub const ADVANCED_BLEND_MODE_LUMINOSITY: &str = "Luminosity";
pub const ADVANCED_BLEND_MODE_OVERLAY: &str = "Overlay";
pub const ADVANCED_BLEND_MODE_SATURATION: &str = "Saturation";
pub const ADVANCED_BLEND_MODE_SOFT_LIGHT: &str = "SoftLight";

pub const COMPOSITE_OPERATOR_CLEAR: &str = "Clear";
pub const COMPOSITE_OPERATOR_COPY: &str = "Copy";
pub const COMPOSITE_OPERATOR_DESTINATION_ATOP: &str = "DestinationAtop";
pub const COMPOSITE_OPERATOR_DESTINATION_IN: &str = "DestinationIn";
pub const COMPOSITE_OPERATOR_DESTINATION_OUT: &str = "DestinationOut";
pub const COMPOSITE_OPERATOR_DESTINATION_OVER: &str = "DestinationOver";
pub const COMPOSITE_OPERATOR_SOURCE_ATOP: &str = "SourceAtop";
pub const COMPOSITE_OPERATOR_SOURCE_IN: &str = "SourceIn";
pub const COMPOSITE_OPERATOR_SOURCE_OUT: &str = "SourceOut";
pub const COMPOSITE_OPERATOR_SOURCE_OVER: &str = "SourceOver";
pub const COMPOSITE_OPERATOR_XOR: &str = "Xor";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum EffectSourceMode {
    #[default]
    Draw,
    Hide,
    Knockout,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum InnerEffectSourceMode {
    #[default]
    Draw,
    Hide,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BevelType {
    Full,
    #[default]
    Inner,
    Outer,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BitmapDisplacementEffectEdgeMode {
    Clamp,
    #[default]
    Wrap,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ToneMapOperator {
    Reinhard,
    #[default]
    Aces,
    Filmic,
    Agx,
    Uncharted2,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EffectInput {
    Hdr,
    Depth,
    Motion,
    Temporal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EffectFieldRole {
    PackedColor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EffectKindFieldRoles {
    pub kind: &'static str,
    pub fields: &'static [(&'static str, EffectFieldRole)],
}

pub type EffectFieldRoles = [EffectKindFieldRoles];

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum EffectPaddingStatus {
    #[default]
    Complete,
    MissingResolver,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AgxToneMapOptions {
    pub min_ev: Option<f32>,
    pub max_ev: Option<f32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FilmicToneMapOptions {
    pub max_brightness: Option<f32>,
    pub contrast: Option<f32>,
    pub linear_start: Option<f32>,
    pub linear_length: Option<f32>,
    pub black_tighten: Option<f32>,
    pub pedestal: Option<f32>,
}

macro_rules! text_property {
    ($t:ty, {$($variant:path => $text:literal),+ $(,)?}) => {
        impl crate::contract::EffectProperty for Option<$t> {
            fn clear_effect_property(&mut self) -> bool { *self = None; true }
            fn get_effect_property(&self) -> Option<crate::contract::EffectValue> {
                return self.map(|value| crate::contract::EffectValue::Text(match value {
                    $($variant => $text,)+
                }.to_string()));
            }

            fn set_effect_property(&mut self, value: crate::contract::EffectValue) -> bool {
                let crate::contract::EffectValue::Text(value) = value else { return false };
                *self = match value.as_str() {
                    $($text => Some($variant),)+
                    _ => return false,
                };
                return true;
            }
        }
    };
}

text_property!(EffectSourceMode, {
    EffectSourceMode::Draw => "draw",
    EffectSourceMode::Hide => "hide",
    EffectSourceMode::Knockout => "knockout",
});
text_property!(InnerEffectSourceMode, {
    InnerEffectSourceMode::Draw => "draw",
    InnerEffectSourceMode::Hide => "hide",
});
text_property!(BevelType, {
    BevelType::Full => "full",
    BevelType::Inner => "inner",
    BevelType::Outer => "outer",
});
text_property!(BitmapDisplacementEffectEdgeMode, {
    BitmapDisplacementEffectEdgeMode::Clamp => "clamp",
    BitmapDisplacementEffectEdgeMode::Wrap => "wrap",
});
text_property!(ToneMapOperator, {
    ToneMapOperator::Reinhard => "reinhard",
    ToneMapOperator::Aces => "aces",
    ToneMapOperator::Filmic => "filmic",
    ToneMapOperator::Agx => "agx",
    ToneMapOperator::Uncharted2 => "uncharted2",
});
