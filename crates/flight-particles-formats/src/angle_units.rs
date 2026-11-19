//! flight-compiler: rust-only

//! Angle-unit conversion at the particle format boundary. Format documents and the particle
//! config keep their f32 angle lanes, while the shared `DEG_TO_RAD`/`RAD_TO_DEG` constants are f64.
//! Each conversion widens the f32 angle exactly, scales it in f64 and narrows once back to f32, so
//! no format value changes width.

use flight_math::{DEG_TO_RAD, RAD_TO_DEG};

// flight-lint: allow(f64) widens an f32 format/config angle to apply the f64 unit constant, then narrows once
pub(crate) fn degrees_to_radians(degrees: f32) -> f32 {
    return (f64::from(degrees) * DEG_TO_RAD) as f32;
}

// flight-lint: allow(f64) widens an f32 config angle to apply the f64 unit constant, then narrows once
pub(crate) fn radians_to_degrees(radians: f32) -> f32 {
    return (f64::from(radians) * RAD_TO_DEG) as f32;
}
