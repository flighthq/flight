use std::sync::RwLock;

use flight_entity::Ref;

use crate::tween::create_tween;
use crate::types::{TimerTarget, Tween, TweenManager, TweenOptions};

pub fn create_tween_timer(
    manager: &TweenManager,
    duration: f32,
    options: Option<&TweenOptions>,
) -> Tween<TimerTarget> {
    let target: Ref<TimerTarget> = Ref::new(RwLock::new(TimerTarget));
    return create_tween(manager, &target, duration, &[], options);
}
