use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use flight_easing::ease_out_exponential;

use crate::types::{EasingFunction, TweenManager, TweenManagerData, TweenManagerOptions};

pub fn create_tween_manager(options: Option<&TweenManagerOptions>) -> TweenManager {
    let default_ease: EasingFunction =
        options.and_then(|o| o.default_ease).unwrap_or(ease_out_exponential);
    return TweenManager {
        data: Rc::new(RefCell::new(TweenManagerData {
            __brand: "TweenManager".to_string(),
            default_ease,
            tweens: HashMap::new(),
        })),
    };
}

pub fn initialize_tween_manager(
    out: &mut TweenManager,
    options: Option<&TweenManagerOptions>,
) {
    let default_ease: EasingFunction =
        options.and_then(|o| o.default_ease).unwrap_or(ease_out_exponential);
    let mut data = out.data.borrow_mut();
    data.__brand = "TweenManager".to_string();
    data.default_ease = default_ease;
    data.tweens = HashMap::new();
}

thread_local! {
    static DEFAULT_MANAGER_CELL: TweenManager = create_tween_manager(None);
}

pub fn default_manager() -> TweenManager {
    return DEFAULT_MANAGER_CELL.with(|m| m.clone());
}
