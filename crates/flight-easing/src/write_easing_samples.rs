use flight_entity::{Float32Array, throw_error};

// flight-lint: conform-skip(createEasingSamples) D24 Principal4dc5429b: user-approved replacement is write_easing_samples(out, ease), count from output length; no allocating form

/// Samples `ease` uniformly over the caller's entire output buffer.
/// The single-entry case samples the midpoint; larger buffers include both endpoints.
/// Throws the source count error before invoking `ease` when `out` is empty.
// flight-lint: allow(conform-extra) D24 Principal4dc5429b: user-approved writeEasingSamples(out, ease) replaces pinned createEasingSamples(ease, count, out?); no allocation or explicit count
pub fn write_easing_samples(out: &mut Float32Array, ease: &dyn Fn(f32) -> f32) {
    let count = out.len();
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
        let clamped_t = if t < 0.0 {
            0.0
        } else if t > 1.0 {
            1.0
        } else {
            t
        };
        out[i] = ease(clamped_t);
    }
    out[0] = ease(0.0);
    out[count - 1] = ease(1.0);
}
