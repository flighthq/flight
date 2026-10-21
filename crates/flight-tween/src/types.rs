use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_signals::Signal;

/// Type alias for easing functions. All easing functions take a normalized time
/// value (0..1) and return the eased value.
pub type EasingFunction = fn(f32) -> f32;

/// Detail for a single property being tweened.
#[derive(Clone, Debug)]
pub struct TweenPropertyDetail {
    pub change: f32,
    pub key: String,
    pub start: f32,
}

/// A shared mutable target: a map of property names to numeric values.
/// Uses Arc<Mutex<...>> for shared ownership (D5 thread safe).
#[derive(Clone)]
pub struct TweenTarget {
    pub props: Ref<HashMap<String, f32>>,
}

/// Creates a TweenTarget from a HashMap.
pub fn create_tween_target(props: HashMap<String, f32>) -> TweenTarget {
    return TweenTarget {
        props: Ref::new(RwLock::new(props)),
    };
}

/// Returns a unique identity key for a TweenTarget, derived from its Arc pointer (Ref).
/// Two TweenTarget clones (same underlying data) produce the same key.
pub fn target_key(target: &TweenTarget) -> usize {
    return Arc::as_ptr(&target.props) as usize;
}

/// Internal data for a Tween.
pub struct TweenData {
    pub complete: bool,
    pub delay: f32,
    pub duration: f32,
    pub ease: EasingFunction,
    pub elapsed: f32,
    pub initialized: bool,
    pub on_complete: Signal<()>,
    pub on_repeat: Signal<()>,
    pub on_update: Signal<()>,
    pub on_yoyo: Signal<()>,
    pub paused: bool,
    pub properties: Vec<TweenPropertyDetail>,
    pub property_map: HashMap<String, f32>,
    pub reflect: bool,
    pub repeat: i32,
    pub reverse: bool,
    pub smart_rotation: bool,
    pub snapping: bool,
    pub target: TweenTarget,
    /// Registration property keys (replaces TS WeakMap pattern).
    pub registration_property_keys: Option<Vec<String>>,
}

/// An active property interpolation tween. Clone gives a shared reference.
#[derive(Clone)]
pub struct Tween {
    pub data: Rc<RefCell<TweenData>>,
}

impl PartialEq for Tween {
    fn eq(&self, other: &Self) -> bool {
        return Rc::ptr_eq(&self.data, &other.data);
    }
}

/// Configuration options for creating a tween.
#[derive(Clone, Debug, Default)]
pub struct TweenOptions {
    pub delay: Option<f32>,
    pub ease: Option<EasingFunction>,
    pub overwrite: Option<bool>,
    pub reflect: Option<bool>,
    pub repeat: Option<i32>,
    pub reverse: Option<bool>,
    pub smart_rotation: Option<bool>,
    pub snapping: Option<bool>,
}

/// Options for stopping a tween.
#[derive(Clone, Debug, Default)]
pub struct StopTweenOptions {
    pub complete: Option<bool>,
    pub send_event: Option<bool>,
}

/// Internal data for a TweenManager.
pub struct TweenManagerData {
    pub __brand: String,
    pub default_ease: EasingFunction,
    pub tweens: HashMap<usize, Vec<Tween>>,
}

/// Manages multiple active tweens. Clone gives a shared reference.
#[derive(Clone)]
pub struct TweenManager {
    pub data: Rc<RefCell<TweenManagerData>>,
}

/// Configuration options for creating a TweenManager.
#[derive(Clone, Debug, Default)]
pub struct TweenManagerOptions {
    pub default_ease: Option<EasingFunction>,
}

/// Specifies the origin point for stagger delay calculation.
#[derive(Clone, Debug)]
pub enum StaggerFrom {
    Start,
    End,
    Center,
    Index(f32),
}

impl Default for StaggerFrom {
    fn default() -> Self {
        return StaggerFrom::Start;
    }
}

/// Configuration options for staggered tween creation.
#[derive(Clone, Debug, Default)]
pub struct TweenStaggerOptions {
    pub each: Option<f32>,
    pub from: Option<StaggerFrom>,
    pub stagger_ease: Option<EasingFunction>,
}
