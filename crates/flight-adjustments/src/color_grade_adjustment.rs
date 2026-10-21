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

/// Options for `create_color_grade_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct ColorGradeAdjustmentOptions {
    pub exposure: Option<f32>,
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
    pub saturation: Option<f32>,
    pub temperature: Option<f32>,
    pub tint: Option<f32>,
    pub lift: Option<u32>,
    pub gamma: Option<u32>,
    pub gain: Option<u32>,
}

pub fn create_color_grade_adjustment(options: Option<&ColorGradeAdjustmentOptions>) -> ColorGradeAdjustment {
    let mut out: ColorGradeAdjustment = allocate_entity();
    initialize_color_grade_adjustment(&mut out, options);
    return out;
}

pub fn initialize_color_grade_adjustment(out: &mut ColorGradeAdjustment, options: Option<&ColorGradeAdjustmentOptions>) {
    let exposure = options.and_then(|o| o.exposure).unwrap_or(0.0);
    let brightness = options.and_then(|o| o.brightness).unwrap_or(0.0);
    let contrast = options.and_then(|o| o.contrast).unwrap_or(1.0);
    let saturation = options.and_then(|o| o.saturation).unwrap_or(1.0);
    let temperature = options.and_then(|o| o.temperature).unwrap_or(0.0);
    let tint = options.and_then(|o| o.tint).unwrap_or(0.0);
    let lift = options.and_then(|o| o.lift).unwrap_or(0x000000ff);
    let gamma = options.and_then(|o| o.gamma).unwrap_or(0x808080ff);
    let gain = options.and_then(|o| o.gain).unwrap_or(0xffffffff);
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
