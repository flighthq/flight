/// Linear exposure as a matrix-tier adjustment: RGB is scaled by `2^exposure`. Alpha is unchanged.
/// Default exposure 0 is the identity.
#[derive(Debug, Clone)]
pub struct ExposureAdjustment {
    pub exposure: f32,
    pub color_matrix: [f32; 20],
}

impl Default for ExposureAdjustment {
    fn default() -> Self {
        return Self {
            exposure: 0.0,
            color_matrix: [0.0; 20],
        };
    }
}

pub fn create_exposure_adjustment(exposure: f32) -> ExposureAdjustment {
    let mut out = ExposureAdjustment::default();
    initialize_exposure_adjustment(&mut out, exposure);
    return out;
}

pub fn initialize_exposure_adjustment(out: &mut ExposureAdjustment, exposure: f32) {
    let m = (2.0_f32).powf(exposure);
    let color_matrix = [
        m, 0.0, 0.0, 0.0, 0.0,
        0.0, m, 0.0, 0.0, 0.0,
        0.0, 0.0, m, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.exposure = exposure;
    out.color_matrix = color_matrix;
}
