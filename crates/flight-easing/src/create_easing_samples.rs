use flight_entity::Float32Array;
use flight_entity::throw_error;

/// Samples `ease` at `count` uniformly-spaced values of t in [0,1] and returns
/// the results as a new `Float32Array`.
///
/// The first sample is always ease(0) and the last is always ease(1) when
/// count >= 2. For count=1, the single sample is ease(0.5).
///
/// Throws (typed panic, D10) if count is 0.
// flight-lint: allow(conform-params) D24: user-approved explicit allocating create_easing_samples(ease, count); provided output uses write_easing_samples
pub fn create_easing_samples(ease: &dyn Fn(f32) -> f32, count: usize) -> Box<Float32Array> {
    if count == 0 {
        throw_error("createEasingSamples: count must be a finite integer >= 1");
    }
    let mut out = vec![0.0_f32; count].into_boxed_slice();
    write_easing_samples(&mut out, ease, count);
    return out;
}

/// Retained initialization delegate to the required-output sampling writer.
// flight-lint: allow(conform-extra) D24: retained initialization compatibility delegate to write_easing_samples; never allocates output
pub fn initialize_easing_samples(out: &mut Float32Array, ease: &dyn Fn(f32) -> f32, count: usize) {
    return write_easing_samples(out, ease, count);
}

/// Samples `ease` at `count` uniformly-spaced values of t in [0,1] into `out`.
/// Entries beyond the output length are ignored, matching typed-array writes.
///
/// The first sample is always ease(0) and the last is always ease(1) when
/// count >= 2. For count=1, the single sample is ease(0.5).
///
/// Throws (typed panic, D10) if count is 0.
// flight-lint: allow(conform-extra) D24: user-approved required out-first sibling of allocating create_easing_samples; pinned TS optional-out branch
pub fn write_easing_samples(out: &mut Float32Array, ease: &dyn Fn(f32) -> f32, count: usize) {
    if count == 0 {
        throw_error("createEasingSamples: count must be a finite integer >= 1");
    }
    if count == 1 {
        let sample = ease(0.5);
        if let Some(value) = out.get_mut(0) {
            *value = sample;
        }
        return;
    }
    let step = 1.0 / (count as f32 - 1.0);
    for i in 0..count {
        let t = i as f32 * step;
        let clamped_t = if t < 0.0 {
            0.0
        } else if t > 1.0 {
            1.0
        } else {
            t
        };
        let sample = ease(clamped_t);
        if let Some(value) = out.get_mut(i) {
            *value = sample;
        }
    }
    let first = ease(0.0);
    if let Some(value) = out.get_mut(0) {
        *value = first;
    }
    let last = ease(1.0);
    if let Some(value) = out.get_mut(count - 1) {
        *value = last;
    }
}
