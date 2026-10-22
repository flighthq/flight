use std::any::Any;
use std::fmt;
use std::sync::{Arc, Weak};

use flight_entity::EntityRuntimeSlot;
use flight_host::ProviderRef;
use flight_signals::Signal;

/// Status bar content style (TS `StatusBarStyle`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusBarStyle {
    Light,
    Dark,
    Default,
}

/// Transition used when showing or hiding the status bar (TS `StatusBarAnimation`). `None` is the
/// default (immediate); native hosts honor the animated variants.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusBarAnimation {
    None,
    Fade,
    Slide,
}

/// Opaque handle returned by `push_status_bar_style_entry` (TS `StatusBarStyleEntryHandle`, a plain
/// number). -1 is reserved as the invalid sentinel.
pub type StatusBarStyleEntryHandle = i32;

/// Snapshot of the current status bar state (TS `StatusBarInfo extends Entity`), written into a
/// caller-owned `out`. `color` is a packed RGBA integer (0xRRGGBBAA; 0 when unknown); `height` is in
/// CSS pixels, -1 when not reported (f32: a reported layout size, never accumulated).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StatusBarInfo {
    runtime: EntityRuntimeSlot,
    pub color: u32,
    pub height: f32,
    pub overlays_content: bool,
    pub style: StatusBarStyle,
    pub visible: bool,
}

/// One entry on the status bar style stack (TS `StatusBarStyleEntry`): plain data with every field
/// optional. An unset field falls through to the next entry down (last pushed wins per field).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StatusBarStyleEntry {
    pub animation: Option<StatusBarAnimation>,
    pub color: Option<u32>,
    pub overlays_content: Option<bool>,
    pub style: Option<StatusBarStyle>,
    pub visible: Option<bool>,
}

/// A raw provider change listener and the release a provider returns from `subscribe`.
pub type StatusBarChangeListener = Arc<dyn Fn() + Send + Sync>;
pub type StatusBarUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// OS-driven change delivery (TS `HostStatusBarChangeCapability`).
#[derive(Clone)]
pub struct HostStatusBarChangeCapability {
    /// The provider object this facet belongs to (Principal 9170da33): identity is `Arc::ptr_eq` on
    /// this field, never on callbacks. One provider serving several facets carries the same Arc.
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(StatusBarChangeListener) -> StatusBarUnsubscribe + Send + Sync>,
}

/// Snapshot query (TS `HostStatusBarInfoCapability`): fills `out` with the current state. Its
/// `provider` identity keys the style stack.
#[derive(Clone)]
pub struct HostStatusBarInfoCapability {
    /// The provider object this facet belongs to (Principal 9170da33): identity is `Arc::ptr_eq` on
    /// this field, never on callbacks. One provider serving several facets carries the same Arc.
    pub provider: ProviderRef,
    pub get_info: Arc<dyn Fn(&mut StatusBarInfo) + Send + Sync>,
}

/// TS `HostStatusBarOverlaysCapability`.
#[derive(Clone)]
pub struct HostStatusBarOverlaysCapability {
    /// The provider object this facet belongs to (Principal 9170da33): identity is `Arc::ptr_eq` on
    /// this field, never on callbacks. One provider serving several facets carries the same Arc.
    pub provider: ProviderRef,
    pub set_overlays_content: Arc<dyn Fn(bool) + Send + Sync>,
}

/// TS `HostStatusBarStyleCapability`.
#[derive(Clone)]
pub struct HostStatusBarStyleCapability {
    /// The provider object this facet belongs to (Principal 9170da33): identity is `Arc::ptr_eq` on
    /// this field, never on callbacks. One provider serving several facets carries the same Arc.
    pub provider: ProviderRef,
    pub set_style: Arc<dyn Fn(StatusBarStyle) + Send + Sync>,
}

/// TS `HostStatusBarColorCapability`: `color` is packed RGBA; `animated` (optional, as TS) requests
/// a smooth transition on native hosts.
#[derive(Clone)]
pub struct HostStatusBarColorCapability {
    /// The provider object this facet belongs to (Principal 9170da33): identity is `Arc::ptr_eq` on
    /// this field, never on callbacks. One provider serving several facets carries the same Arc.
    pub provider: ProviderRef,
    pub set_background_color: Arc<dyn Fn(u32, Option<bool>) + Send + Sync>,
}

/// TS `HostStatusBarVisibilityCapability`: `animation` is optional, as TS.
#[derive(Clone)]
pub struct HostStatusBarVisibilityCapability {
    /// The provider object this facet belongs to (Principal 9170da33): identity is `Arc::ptr_eq` on
    /// this field, never on callbacks. One provider serving several facets carries the same Arc.
    pub provider: ProviderRef,
    pub set_visible: Arc<dyn Fn(bool, Option<StatusBarAnimation>) + Send + Sync>,
}

/// Host status bar capability group (TS `HostStatusBarCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostStatusBarCapabilities {
    pub change: Option<HostStatusBarChangeCapability>,
    pub color: Option<HostStatusBarColorCapability>,
    pub info: Option<HostStatusBarInfoCapability>,
    pub overlays: Option<HostStatusBarOverlaysCapability>,
    pub style: Option<HostStatusBarStyleCapability>,
    pub visibility: Option<HostStatusBarVisibilityCapability>,
}

/// Status bar event entity (TS `StatusBar extends Entity`). The private `subscription` is the exact
/// release of the attached change provider (TS keeps it in a module WeakMap keyed by the entity).
#[derive(Default)]
pub struct StatusBar {
    runtime: EntityRuntimeSlot,
    pub on_change: Signal<StatusBarInfo>,
    pub(crate) subscription: Option<StatusBarUnsubscribe>,
}

/// Caller-owned style-stack state (D5), replacing the source's module-level
/// `WeakMap<HostStatusBarInfoCapability, StyleStackState>` and its global handle counter. One stack
/// per info provider, keyed by that provider's object identity (its `provider` Arc) through a non-owning handle, so a
/// stack never keeps its provider alive; a stack is removed when it empties, as in TS.
// flight-lint: allow(contract-vocabulary) D5: Rust-only caller-owned state replacing the source module WeakMap and handle counter; never transpiled
pub struct StatusBarStyleStacks {
    pub(crate) next_handle: StatusBarStyleEntryHandle,
    pub(crate) stacks: Vec<StatusBarStyleStack>,
}

/// One info provider's stack: the baseline captured once at the first push, the last applied
/// values, the pinned command providers, and the entries in push order.
pub(crate) struct StatusBarStyleStack {
    pub(crate) info: StatusBarInfoProviderWeak,
    pub(crate) applied: StatusBarInfo,
    pub(crate) baseline: StatusBarInfo,
    pub(crate) color_provider: HostStatusBarColorCapability,
    pub(crate) entries: Vec<(StatusBarStyleEntry, StatusBarStyleEntryHandle)>,
    pub(crate) overlays_provider: HostStatusBarOverlaysCapability,
    pub(crate) style_provider: HostStatusBarStyleCapability,
    pub(crate) visibility_provider: HostStatusBarVisibilityCapability,
}

/// A non-owning handle to an info provider, keying the caller-owned style stacks.
// flight-lint: allow(contract-vocabulary) D5: non-owning provider key mirroring the source WeakMap; the WeakRef vocabulary row is a builder5 foundation item and this state never transpiles
pub(crate) type StatusBarInfoProviderWeak = Weak<dyn Any + Send + Sync>;

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_status_bar_info sets the documented unknown/default snapshot
impl Default for StatusBarStyle {
    fn default() -> Self {
        return StatusBarStyle::Default;
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: a clone shares the signal (identity, as TS) but not the attach subscription, which TS keys to the original entity only
impl Clone for StatusBar {
    fn clone(&self) -> Self {
        return StatusBar {
            runtime: EntityRuntimeSlot::default(),
            on_change: self.on_change.clone(),
            subscription: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscription is a closure, so Debug reports whether one is held
impl fmt::Debug for StatusBar {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("StatusBar")
            .field("on_change", &self.on_change)
            .field("attached", &self.subscription.is_some())
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: provider records hold closures, so Debug reports the live stack count and the next handle
impl fmt::Debug for StatusBarStyleStacks {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("StatusBarStyleStacks")
            .field("next_handle", &self.next_handle)
            .field("stacks", &self.stacks.len())
            .finish();
    }
}

flight_entity::impl_entity!(StatusBar);
flight_entity::impl_entity!(StatusBarInfo);
