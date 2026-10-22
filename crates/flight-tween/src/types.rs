use std::marker::PhantomData;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_signals::Signal;

// ── Types ────────────────────────────────────────────────────────────

pub type EasingFunction = fn(f32) -> f32;

// flight-lint: allow(conform-extra) D22 Rust fn-pointer property accessor replacing TS NumericProps<T>
pub struct TweenProp<T: ?Sized> {
    pub get: fn(&mut T) -> &mut f32,
    pub key: &'static str,
    pub to: f32,
}

/// Constructs a [`TweenProp`] from a field name and target value.
///
/// A misspelled or non-existent field is a compile error:
///
/// ```compile_fail
/// struct Pos { x: f32, y: f32 }
/// let _bad = flight_tween::tween_prop!(zz, 1.0);
/// let _: flight_tween::TweenProp<Pos> = _bad;
/// ```
#[macro_export]
macro_rules! tween_prop {
    ($field:ident, $to:expr) => {
        $crate::TweenProp {
            get: |t| &mut t.$field,
            key: stringify!($field),
            to: $to,
        }
    };
}

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

#[derive(Clone, Debug, Default)]
pub struct TweenManagerOptions {
    pub default_ease: Option<EasingFunction>,
}

pub struct TweenCommon {
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
    pub reflect: bool,
    pub repeat: i32,
    pub reverse: bool,
    pub smart_rotation: bool,
    pub snapping: bool,
}

pub(crate) trait TweenOps: Send + Sync {
    fn has_property(&self, key: &str) -> bool;
    fn initialize(&mut self, smart_rotation: bool);
    fn property_keys(&self) -> Vec<String>;
    fn target_key(&self) -> usize;
    fn write_values(&self, eased_t: f32, snapping: bool);
}

pub struct ErasedTweenInner {
    pub common: TweenCommon,
    pub(crate) ops: Box<dyn TweenOps>,
    pub(crate) registration_property_keys: Option<Vec<String>>,
}

pub(crate) type ErasedTweenRef = Arc<RwLock<ErasedTweenInner>>;

pub(crate) struct ErasedTweenHandle {
    pub(crate) data: ErasedTweenRef,
}

pub(crate) struct PropertyState<T: ?Sized> {
    pub get: fn(&mut T) -> &mut f32,
    pub key: String,
    pub to: f32,
    pub start: f32,
    pub change: f32,
}

pub(crate) struct TypedTweenOps<T: ?Sized + Send + Sync + 'static> {
    pub target: Ref<T>,
    pub properties: Vec<PropertyState<T>>,
}

// flight-lint: allow(contract-vocabulary) D22 Tween<T> requires T: Send + Sync + 'static for Arc<RwLock<>> thread-safety
pub struct Tween<T: ?Sized + Send + Sync + 'static> {
    pub(crate) data: ErasedTweenRef,
    _marker: PhantomData<T>,
    runtime: EntityRuntimeSlot,
}

pub struct TweenManager {
    pub data: Ref<TweenManagerData>,
    runtime: EntityRuntimeSlot,
}

pub struct TweenManagerData {
    pub __brand: String,
    pub default_ease: EasingFunction,
    pub(crate) tweens: Vec<(usize, Vec<ErasedTweenHandle>)>,
}

#[derive(Clone)]
pub struct TweenContext {
    pub(crate) manager: Arc<Mutex<Option<TweenManager>>>,
}

// flight-lint: allow(conform-extra) D22 Rust proxy type for RGB component tweening
pub struct ColorComponents {
    pub r: f32,
    pub g: f32,
    pub b: f32,
}

// flight-lint: allow(conform-extra) D22 Rust empty target replacing TS empty property map
pub struct TimerTarget;

// ── Free functions ──────────────────────────────────────────────────

// flight-lint: allow(conform-extra) Rust constructor for TweenContext replacing TS module-scoped defaultManager
pub fn create_tween_context() -> TweenContext {
    return TweenContext {
        manager: Arc::new(Mutex::new(None)),
    };
}

fn default_ease(t: f32) -> f32 {
    return t;
}

// flight-lint: allow(conform-extra) Rust sugar-layer free function backing impl PartialEq for Tween
// flight-lint: allow(contract-vocabulary) D22 Tween<T> requires T: Send + Sync + 'static for Arc<RwLock<>> thread-safety
pub fn equals_tween<T: ?Sized + Send + Sync + 'static>(a: &Tween<T>, b: &Tween<T>) -> bool {
    return Arc::ptr_eq(&a.data, &b.data);
}

pub(crate) fn erased_has_property(handle: &ErasedTweenHandle, key: &str) -> bool {
    let inner = handle.data.read().unwrap();
    if let Some(ref reg_keys) = inner.registration_property_keys {
        return reg_keys.iter().any(|k| k == key);
    }
    return inner.ops.has_property(key);
}

pub(crate) fn erased_target_key(handle: &ErasedTweenHandle) -> usize {
    return handle.data.read().unwrap().ops.target_key();
}

pub(crate) fn target_key_from_ref<T: ?Sized>(target: &Ref<T>) -> usize {
    return Arc::as_ptr(target) as *const () as usize;
}

// flight-lint: allow(conform-extra) D22 escape hatch for nested/computed property paths
pub fn tween_with<T: ?Sized>(get: fn(&mut T) -> &mut f32, key: &'static str, to: f32) -> TweenProp<T> {
    return TweenProp { get, key, to };
}

// ── Impl blocks ──────────────────────────────────────────────────────

impl<T: ?Sized> Clone for TweenProp<T> {
    fn clone(&self) -> Self {
        return *self;
    }
}

impl<T: ?Sized> Copy for TweenProp<T> {}

impl Clone for ErasedTweenHandle {
    fn clone(&self) -> Self {
        return ErasedTweenHandle {
            data: self.data.clone(),
        };
    }
}

// flight-lint: allow(sugar-delegates) D22 type-erasure core: these are the trait-object vtable, not sugar over free functions
impl<T: ?Sized + Send + Sync + 'static> TweenOps for TypedTweenOps<T> {
    fn has_property(&self, key: &str) -> bool {
        return self.properties.iter().any(|p| p.key == key);
    }

    fn initialize(&mut self, smart_rotation: bool) {
        let mut target = self.target.write().unwrap();
        for prop in self.properties.iter_mut() {
            let start = *(prop.get)(&mut target);
            let end = prop.to;
            prop.start = start;
            prop.change = end - start;
            if smart_rotation {
                let mut change = ((prop.change % 360.0) + 360.0) % 360.0;
                if change > 180.0 {
                    change -= 360.0;
                }
                prop.change = change;
            }
        }
    }

    fn property_keys(&self) -> Vec<String> {
        return self.properties.iter().map(|p| p.key.clone()).collect();
    }

    fn target_key(&self) -> usize {
        return Arc::as_ptr(&self.target) as *const () as usize;
    }

    fn write_values(&self, eased_t: f32, snapping: bool) {
        let mut target = self.target.write().unwrap();
        for prop in self.properties.iter() {
            let mut value = prop.start + prop.change * eased_t;
            if snapping {
                value = value.round();
            }
            *(prop.get)(&mut target) = value;
        }
    }
}

// flight-lint: allow(sugar-delegates) D22 pub(crate) constructors for generic tween handle
impl<T: ?Sized + Send + Sync + 'static> Tween<T> {
    pub(crate) fn new(inner: ErasedTweenRef) -> Self {
        return Tween {
            data: inner,
            _marker: PhantomData,
            runtime: EntityRuntimeSlot::default(),
        };
    }

    pub(crate) fn to_erased(&self) -> ErasedTweenHandle {
        return ErasedTweenHandle {
            data: self.data.clone(),
        };
    }
}

impl<T: ?Sized + Send + Sync + 'static> Clone for Tween<T> {
    fn clone(&self) -> Self {
        return Tween {
            data: self.data.clone(),
            _marker: PhantomData,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

// flight-lint: allow(sugar-delegates) D22 identity equality backed by equals_tween free function
impl<T: ?Sized + Send + Sync + 'static> PartialEq for Tween<T> {
    fn eq(&self, other: &Self) -> bool {
        return Arc::ptr_eq(&self.data, &other.data);
    }
}

// flight-lint: allow(sugar-delegates) Entity trait boilerplate — no free function exists for entity_runtime
impl<T: ?Sized + Send + Sync + 'static> flight_entity::Entity for Tween<T> {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return &self.runtime;
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return &mut self.runtime;
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

flight_entity::impl_entity!(TweenManager);

impl Default for StaggerFrom {
    fn default() -> Self {
        return StaggerFrom::Start;
    }
}
