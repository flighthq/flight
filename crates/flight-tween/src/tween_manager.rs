use flight_easing::ease_out_exponential;
use flight_entity::allocate_entity;

use crate::types::{EasingFunction, TweenManager, TweenManagerOptions};

pub fn create_tween_manager(options: Option<&TweenManagerOptions>) -> TweenManager {
    let mut out: TweenManager = allocate_entity();
    initialize_tween_manager(&mut out, options);
    return out;
}

pub fn initialize_tween_manager(
    out: &mut TweenManager,
    options: Option<&TweenManagerOptions>,
) {
    let default_ease: EasingFunction =
        options.and_then(|o| o.default_ease).unwrap_or(ease_out_exponential);
    let mut data = out.data.write().unwrap();
    data.__brand = "TweenManager".to_string();
    data.default_ease = default_ease;
    data.tweens = Vec::new();
}

// D5: TS `defaultManager` is a module-level singleton. Rust exposes no hidden global;
// callers create and own their manager via create_tween_manager(None).
