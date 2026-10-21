use crate::types::{LightUnit, PhotometricLightLike};

// flight-lint: allow-file(contract-vocabulary) D16 structural PhotometricLightLike matches the open two-field TS interface

const REFERENCE_PHOTOMETRIC_LEVEL: f32 = 100_000.0;

pub fn apply_light_exposure(intensity: f32, ev: f32) -> f32 {
    return intensity * 2.0_f32.powf(ev);
}

pub fn convert_light_intensity(from_unit: LightUnit, to_unit: LightUnit, value: f32) -> f32 {
    return value * linear_per_unit(from_unit) / linear_per_unit(to_unit);
}

pub fn get_light_linear_intensity(unit: LightUnit, value: f32) -> f32 {
    return value * linear_per_unit(unit);
}

pub fn get_light_photometric_intensity(light: &dyn PhotometricLightLike) -> f32 {
    return convert_light_intensity(
        LightUnit::Unitless,
        light.intensity_unit(),
        light.intensity(),
    );
}

fn linear_per_unit(unit: LightUnit) -> f32 {
    return match unit {
        LightUnit::Candela | LightUnit::Lux => 1.0 / REFERENCE_PHOTOMETRIC_LEVEL,
        LightUnit::Lumen => 1.0 / (REFERENCE_PHOTOMETRIC_LEVEL * 4.0 * std::f32::consts::PI),
        LightUnit::Unitless => 1.0,
    };
}

pub fn set_light_photometric_intensity(out: &mut dyn PhotometricLightLike, value: f32) {
    let unit = out.intensity_unit();
    *out.intensity_mut() = get_light_linear_intensity(unit, value);
}
