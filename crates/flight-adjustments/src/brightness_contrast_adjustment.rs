use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Brightness/contrast as a matrix-tier adjustment. Reproduces the prior full-frame shader
/// `rgb = (rgb + brightness - 0.5) * contrast + 0.5`. Identity defaults are brightness 0, contrast 1.
#[derive(Debug, Clone)]
pub struct BrightnessContrastAdjustment {
    runtime: EntityRuntimeSlot,
    pub brightness: f32,
    pub contrast: f32,
    pub color_matrix: [f32; 20],
}

pub fn create_brightness_contrast_adjustment(brightness: f32, contrast: f32) -> BrightnessContrastAdjustment {
    let mut out: BrightnessContrastAdjustment = allocate_entity();
    initialize_brightness_contrast_adjustment(&mut out, brightness, contrast);
    return out;
}

pub fn initialize_brightness_contrast_adjustment(out: &mut BrightnessContrastAdjustment, brightness: f32, contrast: f32) {
    let s = contrast;
    let o = brightness * contrast + 0.5 * (1.0 - contrast);
    let color_matrix = [
        s, 0.0, 0.0, 0.0, o,
        0.0, s, 0.0, 0.0, o,
        0.0, 0.0, s, 0.0, o,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.brightness = brightness;
    out.contrast = contrast;
    out.color_matrix = color_matrix;
}

impl Default for BrightnessContrastAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            brightness: 0.0,
            contrast: 1.0,
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(BrightnessContrastAdjustment);
