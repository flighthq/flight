use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// The full color grade as one LUT-tier adjustment. The exposure/brightness/temperature/tint/saturation/
/// contrast pipeline is ported faithfully from the old colorGradeEffect shader; a lift/gamma/gain
/// pipeline follows it. Gamma makes the composite nonlinear, so the whole grade bakes to one LUT.
#[derive(Debug, Clone)]
pub struct ColorGradeAdjustment {
    runtime: EntityRuntimeSlot,
    pub exposure: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub saturation: f32,
    pub temperature: f32,
    pub tint: f32,
    pub lift: u32,
    pub gamma: u32,
    pub gain: u32,
}

pub fn create_color_grade_adjustment(
    exposure: f32,
    brightness: f32,
    contrast: f32,
    saturation: f32,
    temperature: f32,
    tint: f32,
    lift: u32,
    gamma: u32,
    gain: u32,
) -> ColorGradeAdjustment {
    let mut out: ColorGradeAdjustment = allocate_entity();
    initialize_color_grade_adjustment(&mut out, exposure, brightness, contrast, saturation, temperature, tint, lift, gamma, gain);
    return out;
}

pub fn initialize_color_grade_adjustment(
    out: &mut ColorGradeAdjustment,
    exposure: f32,
    brightness: f32,
    contrast: f32,
    saturation: f32,
    temperature: f32,
    tint: f32,
    lift: u32,
    gamma: u32,
    gain: u32,
) {
    out.exposure = exposure;
    out.brightness = brightness;
    out.contrast = contrast;
    out.saturation = saturation;
    out.temperature = temperature;
    out.tint = tint;
    out.lift = lift;
    out.gamma = gamma;
    out.gain = gain;
}

impl Default for ColorGradeAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            exposure: 0.0,
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
            temperature: 0.0,
            tint: 0.0,
            lift: 0x000000ff,
            gamma: 0x808080ff,
            gain: 0xffffffff,
        };
    }
}

flight_entity::impl_entity!(ColorGradeAdjustment);
