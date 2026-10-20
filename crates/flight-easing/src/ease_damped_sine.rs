use std::f32::consts::PI;

/// The parameterized form of `ease_in_elastic`: a decaying sine that winds up
/// before departing, with the overshoot and wavelength stated rather than fixed.
pub fn ease_in_damped_sine(amplitude: f32, period: f32) -> Box<dyn Fn(f32) -> f32> {
    let wavelength = to_damped_sine_wavelength(period);
    let overshoot = to_damped_sine_overshoot(amplitude);
    let phase = to_damped_sine_phase(overshoot, wavelength);
    return Box::new(move |t: f32| -> f32 {
        if t == 0.0 || t == 1.0 {
            return t;
        }
        let time = t - 1.0;
        return -(overshoot * 2.0_f32.powf(10.0 * time) * ((time - phase) * TAU / wavelength).sin());
    });
}

/// The parameterized form of `ease_in_out_elastic`: a decaying sine that winds
/// up, crosses, and settles, with the overshoot and wavelength stated rather
/// than fixed.
pub fn ease_in_out_damped_sine(amplitude: f32, period: f32) -> Box<dyn Fn(f32) -> f32> {
    let wavelength = to_damped_sine_wavelength(period);
    let overshoot = to_damped_sine_overshoot(amplitude);
    let phase = to_damped_sine_phase(overshoot, wavelength);
    return Box::new(move |t: f32| -> f32 {
        if t == 0.0 || t == 1.0 {
            return t;
        }
        let time = t * 2.0 - 1.0;
        if time < 0.0 {
            return -0.5 * overshoot * 2.0_f32.powf(10.0 * time) * ((time - phase) * TAU / wavelength).sin();
        }
        return 0.5 * overshoot * 2.0_f32.powf(-10.0 * time) * ((time - phase) * TAU / wavelength).sin() + 1.0;
    });
}

/// The parameterized form of `ease_out_elastic`: a decaying sine that overshoots
/// the target and settles back onto it.
pub fn ease_out_damped_sine(amplitude: f32, period: f32) -> Box<dyn Fn(f32) -> f32> {
    let wavelength = to_damped_sine_wavelength(period);
    let overshoot = to_damped_sine_overshoot(amplitude);
    let phase = to_damped_sine_phase(overshoot, wavelength);
    return Box::new(move |t: f32| -> f32 {
        if t == 0.0 || t == 1.0 {
            return t;
        }
        return overshoot * 2.0_f32.powf(-10.0 * t) * ((t - phase) * TAU / wavelength).sin() + 1.0;
    });
}

fn to_damped_sine_overshoot(amplitude: f32) -> f32 {
    if amplitude < 1.0 {
        return 1.0;
    }
    return amplitude;
}

fn to_damped_sine_phase(overshoot: f32, wavelength: f32) -> f32 {
    return (wavelength / TAU) * (1.0 / overshoot).asin();
}

fn to_damped_sine_wavelength(period: f32) -> f32 {
    if period > 0.0 {
        return period;
    }
    return DEFAULT_DAMPED_SINE_PERIOD;
}

const TAU: f32 = 2.0 * PI;
const DEFAULT_DAMPED_SINE_PERIOD: f32 = 0.4;
