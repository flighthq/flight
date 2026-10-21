use std::sync::Arc;

/// Returns a new easing function that clamps `t` to [0,1] before delegating to `ease`.
pub fn ease_clamp(
    ease: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    return Arc::new(move |t: f32| -> f32 {
        let clamped = if t < 0.0 { 0.0 } else if t > 1.0 { 1.0 } else { t };
        return ease(clamped);
    });
}

/// Returns a new easing function that clamps the output of `ease` to [min, max].
pub fn ease_clamp_output(
    ease: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
    min: f32,
    max: f32,
) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    return Arc::new(move |t: f32| -> f32 {
        let v = ease(t);
        return if v < min { min } else if v > max { max } else { v };
    });
}

/// Returns a new easing function that is the vertical mirror of `ease`:
/// `t => 1 - ease(t)`. Maps f(0)=0,f(1)=1 curves to f(0)=1,f(1)=0.
pub fn ease_invert(
    ease: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    return Arc::new(move |t: f32| -> f32 {
        return 1.0 - ease(t);
    });
}

/// Derives an InOut curve from an In curve using the standard half-and-mirror
/// splice: the first half maps `[0,0.5]` via the In curve, and the second half
/// mirrors that across the diagonal.
pub fn ease_mirror(
    ease_in: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    return Arc::new(move |t: f32| -> f32 {
        if t < 0.5 {
            return ease_in(t * 2.0) * 0.5;
        }
        return 1.0 - ease_in((1.0 - t) * 2.0) * 0.5;
    });
}

/// Derives an Out curve from an In curve: `t => 1 - easeIn(1 - t)`.
pub fn ease_reverse(
    ease_in: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    return Arc::new(move |t: f32| -> f32 {
        return 1.0 - ease_in(1.0 - t);
    });
}

/// Remaps the output of `ease` from [0,1] to [from_value, to_value].
pub fn ease_scale_output(
    ease: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
    from_value: f32,
    to_value: f32,
) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    return Arc::new(move |t: f32| -> f32 {
        return from_value + ease(t) * (to_value - from_value);
    });
}
