use std::sync::Arc;

use flight_entity::throw_error;

#[derive(Clone)]
pub struct EasingSegment {
    pub ease: Arc<dyn Fn(f32) -> f32 + Send + Sync>,
    pub weight: Option<f32>,
}

/// Returns an easing function that splices multiple easing functions across the
/// [0,1] input range. Each segment is allocated a proportional slice of the
/// input domain based on its `weight` (default 1). Weights are relative.
pub fn ease_piecewise(segments: &[EasingSegment]) -> Arc<dyn Fn(f32) -> f32 + Send + Sync> {
    if segments.is_empty() {
        throw_error("easePiecewise: segments array must not be empty");
    }

    let total_weight: f32 = segments.iter().map(|s| s.weight.unwrap_or(1.0)).sum();
    if total_weight <= 0.0 {
        throw_error("easePiecewise: total segment weight must be greater than zero");
    }

    let mut breakpoints: Vec<(Arc<dyn Fn(f32) -> f32 + Send + Sync>, f32, f32)> = Vec::new();
    let mut accumulated = 0.0_f32;
    for segment in segments {
        let weight = segment.weight.unwrap_or(1.0);
        let start = accumulated / total_weight;
        accumulated += weight;
        let end = accumulated / total_weight;
        breakpoints.push((segment.ease.clone(), start, end));
    }

    let last_ease = segments[segments.len() - 1].ease.clone();

    return Arc::new(move |t: f32| -> f32 {
        for i in 0..breakpoints.len() {
            let (ease, start, end) = &breakpoints[i];
            if t <= *end || i == breakpoints.len() - 1 {
                let span = *end - *start;
                let local_t = if span > 0.0 { (t - *start) / span } else { 1.0 };
                let clamped_t = if local_t < 0.0 { 0.0 } else if local_t > 1.0 { 1.0 } else { local_t };
                return ease(clamped_t);
            }
        }
        return last_ease(1.0);
    });
}
