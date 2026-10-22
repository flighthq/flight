use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_matrix_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_brightness_contrast_adjustment() {
        let a = BrightnessContrastAdjustment::new(Some(&BrightnessContrastAdjustmentOptions {
            brightness: Some(0.1),
            contrast: Some(1.2),
        }));
        let b = create_brightness_contrast_adjustment(Some(&BrightnessContrastAdjustmentOptions {
            brightness: Some(0.1),
            contrast: Some(1.2),
        }));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Brightness/contrast as a matrix-tier adjustment. Reproduces the prior full-frame shader
/// `rgb = (rgb + brightness - 0.5) * contrast + 0.5`. Identity defaults are brightness 0, contrast 1.
#[derive(Debug, Clone)]
pub struct BrightnessContrastAdjustment {
    fields: AdjustmentFields,
    pub brightness: f32,
    pub contrast: f32,
}

/// Options for `create_brightness_contrast_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct BrightnessContrastAdjustmentOptions {
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
}

// flight-lint: allow(conform-params) D23 C: options derive the 4x5 color matrix from brightness+contrast — KEEP under c0f9227c
pub fn create_brightness_contrast_adjustment(
    options: Option<&BrightnessContrastAdjustmentOptions>,
) -> BrightnessContrastAdjustment {
    let mut out: BrightnessContrastAdjustment = allocate_entity();
    initialize_brightness_contrast_adjustment(&mut out, options);
    return out;
}

// flight-lint: allow(conform-params) D23 C: options derive the 4x5 color matrix from brightness+contrast — KEEP under c0f9227c
pub fn initialize_brightness_contrast_adjustment(
    out: &mut BrightnessContrastAdjustment,
    options: Option<&BrightnessContrastAdjustmentOptions>,
) {
    let brightness = options.and_then(|o| o.brightness).unwrap_or(0.0);
    let contrast = options.and_then(|o| o.contrast).unwrap_or(1.0);
    let s = contrast;
    let o = brightness * contrast + 0.5 * (1.0 - contrast);
    let color_matrix = [
        s, 0.0, 0.0, 0.0, o, 0.0, s, 0.0, 0.0, o, 0.0, 0.0, s, 0.0, o, 0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.brightness = brightness;
    out.contrast = contrast;
    initialize_color_matrix_adjustment(out, "BrightnessContrastAdjustment", color_matrix);
}

impl Default for BrightnessContrastAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            brightness: 0.0,
            contrast: 1.0,
        };
    }
}

impl BrightnessContrastAdjustment {
    pub fn new(options: Option<&BrightnessContrastAdjustmentOptions>) -> Self {
        return create_brightness_contrast_adjustment(options);
    }
}

crate::impl_adjustment!(BrightnessContrastAdjustment, "brightness" => brightness, "contrast" => contrast);
