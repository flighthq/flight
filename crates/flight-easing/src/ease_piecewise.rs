#[derive(Clone, Copy)]
pub struct EasingSegment {
    pub ease: fn(f32) -> f32,
    pub weight: f32,
}

pub fn create_easing_segment(ease: fn(f32) -> f32, weight: f32) -> EasingSegment {
    return EasingSegment { ease, weight };
}

/// Returns an easing function that splices multiple easing functions across the
/// [0,1] input range. Each segment is allocated a proportional slice of the
/// input domain based on its `weight`. Weights are relative.
pub fn ease_piecewise(segments: &[EasingSegment]) -> Box<dyn Fn(f32) -> f32> {
    if segments.is_empty() {
        panic!("ease_piecewise: segments array must not be empty");
    }

    let total_weight: f32 = segments.iter().map(|s| s.weight).sum();
    if total_weight <= 0.0 {
        panic!("ease_piecewise: total segment weight must be greater than zero");
    }

    let mut breakpoints: Vec<(fn(f32) -> f32, f32, f32)> = Vec::new();
    let mut accumulated = 0.0_f32;
    for seg in segments {
        let start = accumulated / total_weight;
        accumulated += seg.weight;
        let end = accumulated / total_weight;
        breakpoints.push((seg.ease, start, end));
    }

    let last_ease = segments[segments.len() - 1].ease;

    return Box::new(move |t: f32| -> f32 {
        for i in 0..breakpoints.len() {
            let (ease, start, end) = breakpoints[i];
            if t <= end || i == breakpoints.len() - 1 {
                let span = end - start;
                let local_t = if span > 0.0 { (t - start) / span } else { 1.0 };
                let clamped_t = if local_t < 0.0 { 0.0 } else if local_t > 1.0 { 1.0 } else { local_t };
                return ease(clamped_t);
            }
        }
        return last_ease(1.0);
    });
}
