use std::collections::HashMap;
use std::sync::RwLock;

use flight_entity::Ref;

use crate::tween::create_tween;
use crate::types::{Tween, TweenManager, TweenOptions, TweenTarget};

pub fn create_tween_timer(
    manager: &TweenManager,
    duration: f32,
    options: Option<&TweenOptions>,
) -> Tween {
    let target = TweenTarget {
        props: Ref::new(RwLock::new(HashMap::new())),
    };
    return create_tween(manager, &target, duration, &HashMap::new(), options);
}
