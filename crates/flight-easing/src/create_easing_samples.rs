use flight_entity::throw_error;
use flight_entity::Float32Array;

/// Samples `ease` at `count` uniformly-spaced values of t in [0,1] and returns
/// the results as a new `Float32Array`.
///
/// The first sample is always ease(0) and the last is always ease(1) when
/// count >= 2. For count=1, the single sample is ease(0.5).
///
/// Throws (typed panic, D10) if count is 0.
// flight-lint: allow(conform-params) create/initialize split of TS optional out (AGENTS.md)
pub fn create_easing_samples(ease: &dyn Fn(f32) -> f32, count: usize) -> Box<Float32Array> {
    if count == 0 {
        throw_error("createEasingSamples: count must be a finite integer >= 1");
    }
    let mut out = vec![0.0_f32; count].into_boxed_slice();
    initialize_easing_samples(&mut out, ease, count);
    return out;
}

/// Samples `ease` at `count` uniformly-spaced values of t in [0,1] and writes
/// the results into the provided `out` slice.
///
/// The first sample is always ease(0) and the last is always ease(1) when
/// count >= 2. For count=1, the single sample is ease(0.5).
///
/// Throws (typed panic, D10) if count is 0.
// flight-lint: allow(conform-extra) create/initialize split of TS optional out (AGENTS.md)
pub fn initialize_easing_samples(out: &mut Float32Array, ease: &dyn Fn(f32) -> f32, count: usize) {
    if count == 0 {
        throw_error("createEasingSamples: count must be a finite integer >= 1");
    }
    if count == 1 {
        out[0] = ease(0.5);
        return;
    }
    let step = 1.0 / (count as f32 - 1.0);
    for i in 0..count {
        let t = i as f32 * step;
        let clamped_t = if t < 0.0 { 0.0 } else if t > 1.0 { 1.0 } else { t };
        out[i] = ease(clamped_t);
    }
    out[0] = ease(0.0);
    out[count - 1] = ease(1.0);
}
