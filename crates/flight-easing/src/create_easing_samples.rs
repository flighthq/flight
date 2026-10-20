/// Samples `ease` at `count` uniformly-spaced values of t in [0,1] and returns
/// the results as a new `Vec<f32>`.
///
/// The first sample is always ease(0) and the last is always ease(1) when
/// count >= 2. For count=1, the single sample is ease(0.5).
///
/// Panics if count < 1.
pub fn create_easing_samples(ease: &dyn Fn(f32) -> f32, count: i32) -> Vec<f32> {
    if count < 1 {
        panic!("create_easing_samples: count must be >= 1");
    }
    let n = count as usize;
    let mut out = vec![0.0_f32; n];
    initialize_easing_samples(&mut out, ease, count);
    return out;
}

/// Samples `ease` at `count` uniformly-spaced values of t in [0,1] and writes
/// the results into the provided `out` slice.
///
/// The first sample is always ease(0) and the last is always ease(1) when
/// count >= 2. For count=1, the single sample is ease(0.5).
///
/// Panics if count < 1.
pub fn initialize_easing_samples(out: &mut [f32], ease: &dyn Fn(f32) -> f32, count: i32) {
    if count < 1 {
        panic!("initialize_easing_samples: count must be >= 1");
    }
    let n = count as usize;
    if n == 1 {
        out[0] = ease(0.5);
        return;
    }
    let step = 1.0 / (n as f32 - 1.0);
    for i in 0..n {
        let t = i as f32 * step;
        let clamped_t = if t < 0.0 { 0.0 } else if t > 1.0 { 1.0 } else { t };
        out[i] = ease(clamped_t);
    }
    out[0] = ease(0.0);
    out[n - 1] = ease(1.0);
}
