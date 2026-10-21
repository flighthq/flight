use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_signals::Signal;

pub type EasingFunction = fn(f32) -> f32;

#[derive(Clone, Debug)]
pub enum StaggerFrom {
    Start,
    End,
    Center,
    Index(f32),
}

#[derive(Clone, Debug, Default)]
pub struct StopTweenOptions {
    pub complete: Option<bool>,
    pub send_event: Option<bool>,
}

pub struct Tween {
    pub data: Ref<TweenData>,
    runtime: EntityRuntimeSlot,
}

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
    pub registration_property_keys: Option<Vec<String>>,
}

pub struct TweenManager {
    pub data: Ref<TweenManagerData>,
    runtime: EntityRuntimeSlot,
}

pub struct TweenManagerData {
    pub __brand: String,
    pub default_ease: EasingFunction,
    pub tweens: Vec<(usize, Vec<Tween>)>,
}

#[derive(Clone, Debug, Default)]
pub struct TweenManagerOptions {
    pub default_ease: Option<EasingFunction>,
}

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

#[derive(Clone, Debug)]
pub struct TweenPropertyDetail {
    pub change: f32,
    pub key: String,
    pub start: f32,
}

#[derive(Clone, Debug, Default)]
pub struct TweenStaggerOptions {
    pub each: Option<f32>,
    pub from: Option<StaggerFrom>,
    pub stagger_ease: Option<EasingFunction>,
}

// D5: caller-owned explicit context replacing TS module-scoped `defaultManager` singleton.
// Repeated `default_manager` on one context returns the same TweenManager identity;
// different contexts are independent.
#[derive(Clone)]
pub struct TweenContext {
    pub(crate) manager: Arc<Mutex<Option<TweenManager>>>,
}

#[derive(Clone)]
pub struct TweenTarget {
    pub props: Ref<HashMap<String, f32>>,
}

// flight-lint: allow(conform-extra) Rust constructor for TweenContext replacing TS module-scoped defaultManager
pub fn create_tween_context() -> TweenContext {
    return TweenContext {
        manager: Arc::new(Mutex::new(None)),
    };
}

// flight-lint: allow(conform-extra) Rust constructor for TweenTarget replacing TS object literals
pub fn create_tween_target(props: HashMap<String, f32>) -> TweenTarget {
    return TweenTarget {
        props: Ref::new(RwLock::new(props)),
    };
}

fn default_ease(t: f32) -> f32 {
    return t;
}

// flight-lint: allow(conform-extra) Rust sugar-layer free function backing impl PartialEq for Tween
pub fn equals_tween(a: &Tween, b: &Tween) -> bool {
    return Arc::ptr_eq(&a.data, &b.data);
}

// Address-based bookkeeping key for the manager's tween map. Internal implementation detail;
// callers use has_tweens_of / get_tweens_of for target identity queries.
pub(crate) fn target_key(target: &TweenTarget) -> usize {
    return Arc::as_ptr(&target.props) as usize;
}

impl Clone for Tween {
    fn clone(&self) -> Self {
        return Tween {
            data: self.data.clone(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for StaggerFrom {
    fn default() -> Self {
        return StaggerFrom::Start;
    }
}

impl Default for Tween {
    fn default() -> Self {
        return Tween {
            data: Ref::new(RwLock::new(TweenData {
                complete: false,
                delay: 0.0,
                duration: 0.0,
                ease: default_ease,
                elapsed: 0.0,
                initialized: false,
                on_complete: Signal::default(),
                on_repeat: Signal::default(),
                on_update: Signal::default(),
                on_yoyo: Signal::default(),
                paused: false,
                properties: Vec::new(),
                property_map: HashMap::new(),
                reflect: false,
                repeat: 0,
                reverse: false,
                smart_rotation: false,
                snapping: false,
                target: TweenTarget {
                    props: Ref::new(RwLock::new(HashMap::new())),
                },
                registration_property_keys: None,
            })),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for TweenManager {
    fn default() -> Self {
        return TweenManager {
            data: Ref::new(RwLock::new(TweenManagerData {
                __brand: String::new(),
                default_ease: default_ease,
                tweens: Vec::new(),
            })),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl PartialEq for Tween {
    fn eq(&self, other: &Self) -> bool {
        return equals_tween(self, other);
    }
}

impl Clone for TweenManager {
    fn clone(&self) -> Self {
        return TweenManager {
            data: self.data.clone(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

flight_entity::impl_entity!(Tween);
flight_entity::impl_entity!(TweenManager);
