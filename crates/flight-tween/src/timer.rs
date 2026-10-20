use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::tween::create_tween;
use crate::types::{Tween, TweenManager, TweenOptions, TweenTarget};

pub fn create_tween_timer(
    manager: &TweenManager,
    duration: f32,
    options: Option<&TweenOptions>,
) -> Tween {
    let target = TweenTarget {
        props: Rc::new(RefCell::new(HashMap::new())),
    };
    return create_tween(manager, &target, duration, &HashMap::new(), options);
}
