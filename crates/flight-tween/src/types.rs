//! flight-compiler: rust-only

use crate::internal::interpolate_tween_value;
use std::marker::PhantomData;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_signals::Signal;

// ── Types ────────────────────────────────────────────────────────────

// flight-lint: allow(f32) easing over bounded 0-1 progress (flight-easing contract)
pub type EasingFunction = fn(f32) -> f32;

// flight-lint: allow(conform-extra) D22 Rust fn-pointer property accessor replacing TS NumericProps<T>
// flight-lint: allow(contract-vocabulary) D22 native fn-pointer property accessors support Ref<dyn Trait> targets through relaxed generic bounds
pub struct TweenProp<T: ?Sized> {
    pub get: TweenPropertyAccessor<T>,
    pub key: &'static str,
    pub to: f64,
}

/// Where a tween reads and writes its property. Interpolation always runs in f64 (TS Number): an
/// `F64` field is read and written directly, while an `F32` field (a declared f32 lane such as
/// node alpha) is widened exactly on read and narrowed exactly once per write.
// flight-lint: allow(conform-extra) D22 Rust fn-pointer property accessor replacing TS NumericProps<T>
// flight-lint: allow(contract-vocabulary) D22 native fn-pointer property accessors support Ref<dyn Trait> targets through relaxed generic bounds
// flight-lint: allow(f32) F32 addresses a declared f32 field lane; tween math stays f64 (foreman-8dd43e2e)
// flight-lint: allow(enum-payload-named) D22 each arm carries the field accessor fn pointer directly, as TweenProp.get did; a wrapper struct adds no semantic value
pub enum TweenPropertyAccessor<T: ?Sized> {
    F32(fn(&mut T) -> &mut f32),
    F64(fn(&mut T) -> &mut f64),
}

/// Constructs a [`TweenProp`] from a field name and target value.
///
/// A misspelled or non-existent field is a compile error:
///
/// ```compile_fail
/// struct Pos { x: f64, y: f64 }
/// let _bad = flight_tween::tween_prop!(zz, 1.0);
/// let _: flight_tween::TweenProp<Pos> = _bad;
/// ```
#[macro_export]
macro_rules! tween_prop {
    ($field:ident, $to:expr) => {
        $crate::TweenProp {
            get: $crate::TweenPropertyAccessor::F64(|t| &mut t.$field),
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
    Index(f64),
}

#[derive(Clone, Debug, Default)]
pub struct StopTweenOptions {
    pub complete: Option<bool>,
    pub send_event: Option<bool>,
}

#[derive(Clone, Debug, Default)]
pub struct TweenOptions {
    pub delay: Option<f64>,
    pub ease: Option<EasingFunction>,
    pub overwrite: Option<bool>,
    pub reflect: Option<bool>,
    pub repeat: Option<i32>,
    pub reverse: Option<bool>,
    pub smart_rotation: Option<bool>,
    pub snapping: Option<bool>,
}

#[derive(Clone, Debug)]
#[repr(C)]
pub struct TweenPropertyDetail {
    pub change: f64,
    pub key: String,
    pub start: f64,
}

#[derive(Clone, Debug, Default)]
pub struct TweenStaggerOptions {
    pub each: Option<f64>,
    pub from: Option<StaggerFrom>,
    pub stagger_ease: Option<EasingFunction>,
}

#[derive(Clone, Debug, Default)]
pub struct TweenManagerOptions {
    pub default_ease: Option<EasingFunction>,
}

pub struct TweenCommon {
    pub complete: bool,
    pub delay: f64,
    pub duration: f64,
    pub ease: EasingFunction,
    pub elapsed: f64,
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
    pub get: TweenPropertyAccessor<T>,
    pub key: String,
    pub to: f64,
    pub start: f64,
    pub change: f64,
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
#[repr(C)]
pub struct ColorComponents {
    pub r: f64,
    pub g: f64,
    pub b: f64,
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

pub(crate) fn initialize_tween_ops(inner: &mut ErasedTweenInner, smart_rotation: bool) {
    TweenOps::initialize(&mut *inner.ops, smart_rotation);
}

// flight-lint: allow(f32) easing over bounded 0-1 progress (flight-easing contract)
fn default_ease(t: f32) -> f32 {
    return t;
}

// flight-lint: allow(conform-extra) Rust sugar-layer free function backing impl PartialEq for Tween
// flight-lint: allow(contract-vocabulary) D22 Tween<T> requires T: Send + Sync + 'static for Arc<RwLock<>> thread-safety
pub fn equals_tween<T: ?Sized + Send + Sync + 'static>(a: &Tween<T>, b: &Tween<T>) -> bool {
    return Arc::ptr_eq(&a.data, &b.data);
}

pub(crate) fn erase_tween_handle<T: ?Sized + Send + Sync + 'static>(
    tween: &Tween<T>,
) -> ErasedTweenHandle {
    return ErasedTweenHandle {
        data: tween.data.clone(),
    };
}

pub(crate) fn erased_has_property(handle: &ErasedTweenHandle, key: &str) -> bool {
    let inner = handle.data.read().unwrap();
    if let Some(ref reg_keys) = inner.registration_property_keys {
        return reg_keys.iter().any(|k| k == key);
    }
    return TweenOps::has_property(&*inner.ops, key);
}

pub(crate) fn erased_target_key(handle: &ErasedTweenHandle) -> usize {
    return TweenOps::target_key(&*handle.data.read().unwrap().ops);
}

pub(crate) fn get_tween_ops_property_keys(inner: &ErasedTweenInner) -> Vec<String> {
    return TweenOps::property_keys(&*inner.ops);
}

// flight-lint: allow(f32) widens a declared f32 field lane exactly into the f64 tween value
pub(crate) fn read_tween_property<T: ?Sized>(get: TweenPropertyAccessor<T>, target: &mut T) -> f64 {
    return match get {
        TweenPropertyAccessor::F32(field) => f64::from(*field(target)),
        TweenPropertyAccessor::F64(field) => *field(target),
    };
}

pub(crate) fn target_key_from_ref<T: ?Sized>(target: &Ref<T>) -> usize {
    return Arc::as_ptr(target) as *const () as usize;
}

// flight-lint: allow(conform-extra) D22 escape hatch for nested/computed property paths
// flight-lint: allow(contract-vocabulary) D22 native fn-pointer property accessors support Ref<dyn Trait> targets through relaxed generic bounds
pub fn tween_with<T: ?Sized>(
    get: fn(&mut T) -> &mut f64,
    key: &'static str,
    to: f64,
) -> TweenProp<T> {
    return TweenProp {
        get: TweenPropertyAccessor::F64(get),
        key,
        to,
    };
}

/// Tweens a declared f32 field (for example node alpha) with f64 interpolation: the start value is
/// widened exactly, every frame is computed in f64, and each write narrows exactly once.
// flight-lint: allow(conform-extra) D22 escape hatch for declared f32 field lanes (foreman-8dd43e2e)
// flight-lint: allow(contract-vocabulary) D22 native fn-pointer property accessors support Ref<dyn Trait> targets through relaxed generic bounds
// flight-lint: allow(f32) addresses a declared f32 field lane; tween math stays f64 (foreman-8dd43e2e)
pub fn tween_with_f32<T: ?Sized>(
    get: fn(&mut T) -> &mut f32,
    key: &'static str,
    to: f64,
) -> TweenProp<T> {
    return TweenProp {
        get: TweenPropertyAccessor::F32(get),
        key,
        to,
    };
}

// flight-lint: allow(f32) eased_t is the bounded f32 easing output
pub(crate) fn write_tween_ops_values(inner: &ErasedTweenInner, eased_t: f32, snapping: bool) {
    TweenOps::write_values(&*inner.ops, eased_t, snapping);
}

// flight-lint: allow(f32) narrows the f64 tween value exactly once into a declared f32 field lane
pub(crate) fn write_tween_property<T: ?Sized>(
    get: TweenPropertyAccessor<T>,
    target: &mut T,
    value: f64,
) {
    match get {
        TweenPropertyAccessor::F32(field) => *field(target) = value as f32,
        TweenPropertyAccessor::F64(field) => *field(target) = value,
    }
}

// ── Impl blocks ──────────────────────────────────────────────────────

impl<T: ?Sized> Clone for TweenProp<T> {
    fn clone(&self) -> Self {
        return *self;
    }
}

impl<T: ?Sized> Copy for TweenProp<T> {}

impl<T: ?Sized> Clone for TweenPropertyAccessor<T> {
    fn clone(&self) -> Self {
        return *self;
    }
}

impl<T: ?Sized> Copy for TweenPropertyAccessor<T> {}

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
            let start = read_tween_property(prop.get, &mut target);
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

    // flight-lint: allow(f32) eased_t is the bounded f32 easing output
    fn write_values(&self, eased_t: f32, snapping: bool) {
        let mut target = self.target.write().unwrap();
        for prop in self.properties.iter() {
            let mut value = interpolate_tween_value(prop.start, prop.change, eased_t);
            if snapping {
                value = value.round();
            }
            write_tween_property(prop.get, &mut target, value);
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
