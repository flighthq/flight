use flight_entity::Ref;

use crate::tween::create_tween;
use crate::types::{
    EasingFunction, StaggerFrom, Tween, TweenManager, TweenOptions, TweenProp, TweenStaggerOptions,
};

// flight-lint: allow(conform-params) D22 TweenProp<T> fn-pointer accessors replace TS NumericProps<T> property_map
// flight-lint: allow(contract-vocabulary) D22 Tween<T> requires T: Send + Sync + 'static for Arc<RwLock<>> thread-safety
pub fn create_tween_stagger<T: Send + Sync + 'static>(
    manager: &TweenManager,
    targets: &[Ref<T>],
    duration: f32,
    props: &[TweenProp<T>],
    stagger: Option<&TweenStaggerOptions>,
    options: Option<&TweenOptions>,
) -> Vec<Tween<T>> {
    if targets.is_empty() {
        return vec![];
    }
    let each = stagger.and_then(|s| s.each).unwrap_or(0.1);
    let from = stagger
        .and_then(|s| s.from.clone())
        .unwrap_or(StaggerFrom::Start);
    let stagger_ease = stagger.and_then(|s| s.stagger_ease);
    let base_delay = options.and_then(|o| o.delay).unwrap_or(0.0);
    let count = targets.len();
    let mut tweens: Vec<Tween<T>> = Vec::new();
    for i in 0..count {
        let stagger_offset = compute_stagger_delay(i, count, each, &from, stagger_ease);
        let mut opts = options.cloned().unwrap_or_default();
        opts.delay = Some(base_delay + stagger_offset);
        let tween = create_tween(manager, &targets[i], duration, props, Some(&opts));
        tweens.push(tween);
    }
    return tweens;
}

fn compute_stagger_delay(
    index: usize,
    count: usize,
    each: f32,
    from: &StaggerFrom,
    stagger_ease: Option<EasingFunction>,
) -> f32 {
    if count <= 1 {
        return 0.0;
    }
    let index_f = index as f32;
    let count_f = count as f32;
    let normalized_position = match from {
        StaggerFrom::Start => index_f / (count_f - 1.0),
        StaggerFrom::End => (count_f - 1.0 - index_f) / (count_f - 1.0),
        StaggerFrom::Center => {
            let center = (count_f - 1.0) / 2.0;
            (index_f - center).abs() / center
        }
        StaggerFrom::Index(origin) => {
            let origin = origin.max(0.0).min(count_f - 1.0);
            let max_distance = origin.max(count_f - 1.0 - origin);
            if max_distance > 0.0 {
                (index_f - origin).abs() / max_distance
            } else {
                0.0
            }
        }
    };
    let eased = match stagger_ease {
        Some(ease) => ease(normalized_position),
        None => normalized_position,
    };
    return eased * each * (count_f - 1.0);
}
