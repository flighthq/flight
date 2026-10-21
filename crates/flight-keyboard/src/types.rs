use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError};
use flight_signals::Signal;

/// Open resize-mode string accepted by providers. Custom provider modes remain representable.
pub type SoftKeyboardResizeMode = String;

pub const SOFT_KEYBOARD_RESIZE_NONE_KIND: &str = "None";
pub const SOFT_KEYBOARD_RESIZE_BODY_KIND: &str = "Body";

/// Open style string accepted by providers. Custom provider styles remain representable.
pub type SoftKeyboardStyleKind = String;

pub const SOFT_KEYBOARD_STYLE_DEFAULT_KIND: &str = "Default";
pub const SOFT_KEYBOARD_STYLE_DARK_KIND: &str = "Dark";

/// Current host-reported keyboard state and bounds. Geometry is f32 because these are transient
/// display measurements used for layout and comparison, never accumulated coordinates.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SoftKeyboardInfo {
    pub visible: bool,
    pub height: f32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
}

/// Result of asking the host to show or hide the keyboard.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SoftKeyboardVisibilityResult {
    Ok,
    OperationFailed,
}

pub const SOFT_KEYBOARD_VISIBILITY_OK_KIND: SoftKeyboardVisibilityResult =
    SoftKeyboardVisibilityResult::Ok;
pub const SOFT_KEYBOARD_VISIBILITY_OPERATION_FAILED_KIND: SoftKeyboardVisibilityResult =
    SoftKeyboardVisibilityResult::OperationFailed;

/// Result of changing one host keyboard setting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SoftKeyboardSetterResult {
    Ok,
    OperationUnavailable,
    OperationFailed,
}

pub const SOFT_KEYBOARD_SETTER_OK_KIND: SoftKeyboardSetterResult = SoftKeyboardSetterResult::Ok;
pub const SOFT_KEYBOARD_SETTER_OPERATION_UNAVAILABLE_KIND: SoftKeyboardSetterResult =
    SoftKeyboardSetterResult::OperationUnavailable;
pub const SOFT_KEYBOARD_SETTER_OPERATION_FAILED_KIND: SoftKeyboardSetterResult =
    SoftKeyboardSetterResult::OperationFailed;

/// Result of acquiring a raw keyboard-change subscription.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SoftKeyboardAttachResult {
    Ok,
    AcquisitionFailed,
}

pub const SOFT_KEYBOARD_ATTACH_OK_KIND: SoftKeyboardAttachResult = SoftKeyboardAttachResult::Ok;
pub const SOFT_KEYBOARD_ATTACH_ACQUISITION_FAILED_KIND: SoftKeyboardAttachResult =
    SoftKeyboardAttachResult::AcquisitionFailed;

/// The raw no-argument host change notification.
pub type SoftKeyboardChangeListener = Arc<dyn Fn() + Send + Sync>;

/// The exact release returned for one successful subscription.
pub type SoftKeyboardUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// The provider's resolved subscription record. `unsubscribe` is nullable in the source contract;
/// a conforming successful provider supplies it, while failed acquisition supplies None.
#[derive(Clone)]
pub struct SoftKeyboardChangeSubscription {
    pub result: SoftKeyboardAttachResult,
    pub unsubscribe: Option<SoftKeyboardUnsubscribe>,
}

/// A resolved attach result or the error carried by a rejected source Promise.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm distinct from the provider's acquisition-failed result
pub type SoftKeyboardAttachOperationResult = Result<SoftKeyboardAttachResult, FlightError>;

/// A resolved setter result or the error carried by a rejected source Promise.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm distinct from provider operation results
pub type SoftKeyboardSetterOperationResult = Result<SoftKeyboardSetterResult, FlightError>;

/// A resolved visibility result or the error carried by a rejected source Promise.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm distinct from provider operation results
pub type SoftKeyboardVisibilityOperationResult = Result<SoftKeyboardVisibilityResult, FlightError>;

/// Boxed, Send future returned by a change-subscription provider (D15).
// flight-lint: allow(contract-vocabulary) D15/D10: the subscription Promise can reject with FlightError before producing its source record
pub type SoftKeyboardChangeSubscriptionFuture =
    Pin<Box<dyn Future<Output = Result<SoftKeyboardChangeSubscription, FlightError>> + Send>>;

/// Boxed, Send future returned by keyboard-setting providers (D15).
pub type SoftKeyboardSetterFuture =
    Pin<Box<dyn Future<Output = SoftKeyboardSetterOperationResult> + Send>>;

/// Boxed, Send future returned by visibility providers (D15).
pub type SoftKeyboardVisibilityFuture =
    Pin<Box<dyn Future<Output = SoftKeyboardVisibilityOperationResult> + Send>>;

/// Current-state query capability. The provider writes into the caller-owned `out` and returns
/// nothing in Rust under D9b.
#[derive(Clone)]
pub struct HostSoftKeyboardInfoCapability {
    pub get_info: Arc<dyn Fn(&mut SoftKeyboardInfo) + Send + Sync>,
}

/// Raw keyboard-change subscription capability.
#[derive(Clone)]
pub struct HostSoftKeyboardChangeCapability {
    pub subscribe: Arc<
        dyn Fn(SoftKeyboardChangeListener) -> SoftKeyboardChangeSubscriptionFuture + Send + Sync,
    >,
}

/// Host show/hide capability.
#[derive(Clone)]
pub struct HostSoftKeyboardVisibilityCapability {
    pub show: Arc<dyn Fn() -> SoftKeyboardVisibilityFuture + Send + Sync>,
    pub hide: Arc<dyn Fn() -> SoftKeyboardVisibilityFuture + Send + Sync>,
}

/// Host resize-mode mutation capability.
#[derive(Clone)]
pub struct HostSoftKeyboardResizeModeWriteCapability {
    pub set_resize_mode:
        Arc<dyn Fn(SoftKeyboardResizeMode) -> SoftKeyboardSetterFuture + Send + Sync>,
}

/// Host style mutation capability.
#[derive(Clone)]
pub struct HostSoftKeyboardStyleCapability {
    pub set_style: Arc<dyn Fn(SoftKeyboardStyleKind) -> SoftKeyboardSetterFuture + Send + Sync>,
}

/// Host accessory-bar mutation capability.
#[derive(Clone)]
pub struct HostSoftKeyboardAccessoryBarCapability {
    pub set_accessory_bar_visible: Arc<dyn Fn(bool) -> SoftKeyboardSetterFuture + Send + Sync>,
}

/// Host scroll-assist mutation capability.
#[derive(Clone)]
pub struct HostSoftKeyboardScrollAssistCapability {
    pub set_scroll_assist_enabled: Arc<dyn Fn(bool) -> SoftKeyboardSetterFuture + Send + Sync>,
}

/// Optional host soft-keyboard slots (TS `HostSoftKeyboardCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostSoftKeyboardCapabilities {
    pub accessory_bar: Option<HostSoftKeyboardAccessoryBarCapability>,
    pub change: Option<HostSoftKeyboardChangeCapability>,
    pub info: Option<HostSoftKeyboardInfoCapability>,
    pub resize_mode_write: Option<HostSoftKeyboardResizeModeWriteCapability>,
    pub scroll_assist: Option<HostSoftKeyboardScrollAssistCapability>,
    pub style: Option<HostSoftKeyboardStyleCapability>,
    pub visibility: Option<HostSoftKeyboardVisibilityCapability>,
}

/// Soft-keyboard transition entity. The private subscription mirrors the source WeakMap entry but
/// is owned directly by this entity, so no ambient registry or thread-local state is required. The
/// outer Option distinguishes no entry from an entry whose source `unsubscribe` is null.
#[derive(Default)]
pub struct SoftKeyboard {
    runtime: EntityRuntimeSlot,
    pub on_show: Signal<f32>,
    pub on_hide: Signal<()>,
    pub on_resize: Signal<f32>,
    pub(crate) subscription: Option<Option<SoftKeyboardUnsubscribe>>,
}

impl Default for SoftKeyboardAttachResult {
    fn default() -> Self {
        return SoftKeyboardAttachResult::Ok;
    }
}

impl Default for SoftKeyboardSetterResult {
    fn default() -> Self {
        return SoftKeyboardSetterResult::Ok;
    }
}

impl Default for SoftKeyboardVisibilityResult {
    fn default() -> Self {
        return SoftKeyboardVisibilityResult::Ok;
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: a clone shares the three signals (identity, as TS) but not the WeakMap subscription keyed to the original entity
impl Clone for SoftKeyboard {
    fn clone(&self) -> Self {
        return SoftKeyboard {
            runtime: EntityRuntimeSlot::default(),
            on_show: self.on_show.clone(),
            on_hide: self.on_hide.clone(),
            on_resize: self.on_resize.clone(),
            subscription: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the private subscription is a closure, so Debug reports only whether a WeakMap-equivalent entry exists
impl fmt::Debug for SoftKeyboard {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("SoftKeyboard")
            .field("on_show", &self.on_show)
            .field("on_hide", &self.on_hide)
            .field("on_resize", &self.on_resize)
            .field("attached", &self.subscription.is_some())
            .finish();
    }
}

flight_entity::impl_entity!(SoftKeyboard);
