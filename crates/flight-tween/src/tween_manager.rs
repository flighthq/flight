use flight_easing::ease_out_exponential;
use flight_entity::allocate_entity;

use crate::types::{EasingFunction, TweenContext, TweenManager, TweenManagerOptions};

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

// flight-lint: allow(conform-extra) D5 caller-owned context accessor replacing the TS module defaultManager singleton
pub fn default_manager(context: &TweenContext) -> TweenManager {
    let mut guard = context.manager.lock().unwrap();
    if let Some(manager) = guard.as_ref() {
        return manager.clone();
    }
    let manager = create_tween_manager(None);
    *guard = Some(manager.clone());
    return manager;
}
