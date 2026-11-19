//! flight-compiler: rust-only

use flight_math::clamp;

// Media times (ms) and pans stay f32, the channel and host DSP contract (D1 default), while the
// shared `clamp` takes f64. For every non-NaN input the widening is exact and `clamp` returns one of
// its arguments, so the final narrowing gives back an f32 input bit for bit. A NaN input is returned
// before the round trip: `clamp` passes NaN through, but f32 -> f64 -> f32 conversion quiets a
// signaling NaN, which would alter its bits.
// flight-lint: allow(f64) lossless round trip through the shared f64 clamp; every result is an f32 input
pub(crate) fn clamp_media_value(value: f32, min: f32, max: f32) -> f32 {
    if value.is_nan() {
        return value;
    }
    return clamp(f64::from(value), f64::from(min), f64::from(max)) as f32;
}
