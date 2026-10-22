// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_color_temperature_rgb(out: &mut [f32; 3], kelvin: f32) {
    let temp = kelvin.clamp(1000.0, 40000.0) / 100.0;
    let (r, g, b) = if temp <= 66.0 {
        (
            1.0,
            (99.470_8 * temp.ln() - 161.119_57) / 255.0,
            if temp <= 19.0 {
                0.0
            } else {
                (138.517_73 * (temp - 10.0).ln() - 305.044_8) / 255.0
            },
        )
    } else {
        (
            (329.698_73 * (temp - 60.0).powf(-0.133_204_76)) / 255.0,
            (288.122_16 * (temp - 60.0).powf(-0.075_514_846)) / 255.0,
            1.0,
        )
    };
    out[0] = r.clamp(0.0, 1.0);
    out[1] = g.clamp(0.0, 1.0);
    out[2] = b.clamp(0.0, 1.0);
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_white_balance_multipliers(out: &mut [f32; 3], temperature: f32, tint: f32) {
    let kelvin = 6500.0 - temperature * 4500.0;
    compute_color_temperature_rgb(out, kelvin);
    let green_shift = -tint * 0.1;
    out[0] = out[0].max(0.0);
    out[1] = (out[1] + green_shift).max(0.0);
    out[2] = out[2].max(0.0);
}
