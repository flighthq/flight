use std::collections::HashMap;
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex, Weak};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_signals::Signal;

pub use flight_entity::{Record, Unknown};
pub use flight_hostcapability::ProviderRef;

/// A keyboard accelerator in canonical normalized form (TS `Accelerator`).
pub type Accelerator = String;

/// Why an accelerator failed to parse (TS `AcceleratorParseErrorReason`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AcceleratorParseErrorReason {
    DuplicateModifier,
    Empty,
    MissingKey,
    UnknownKey,
    UnknownModifier,
}

/// Token-specific parser diagnostic (TS `AcceleratorParseError`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AcceleratorParseError {
    pub token: String,
    pub reason: AcceleratorParseErrorReason,
}

/// A canonical accelerator modifier (TS `ShortcutModifier`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShortcutModifier {
    Alt,
    CommandOrControl,
    Control,
    Meta,
    Shift,
    Super,
}

/// A canonical accelerator key token (TS `ShortcutKeyName`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShortcutKeyName {
    Digit0,
    Digit1,
    Digit2,
    Digit3,
    Digit4,
    Digit5,
    Digit6,
    Digit7,
    Digit8,
    Digit9,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
    F13,
    F14,
    F15,
    F16,
    F17,
    F18,
    F19,
    F20,
    F21,
    F22,
    F23,
    F24,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    End,
    Home,
    PageDown,
    PageUp,
    Backspace,
    Delete,
    Escape,
    Insert,
    Return,
    Space,
    Tab,
    Numpad0,
    Numpad1,
    Numpad2,
    Numpad3,
    Numpad4,
    Numpad5,
    Numpad6,
    Numpad7,
    Numpad8,
    Numpad9,
    NumpadAdd,
    NumpadDecimal,
    NumpadDivide,
    NumpadEnter,
    NumpadMultiply,
    NumpadSubtract,
    Backquote,
    Backslash,
    BracketLeft,
    BracketRight,
    Comma,
    Equal,
    Minus,
    Period,
    Plus,
    Quote,
    Semicolon,
    Slash,
    MediaNextTrack,
    MediaPlayPause,
    MediaPreviousTrack,
    MediaStop,
    VolumeDown,
    VolumeMute,
    VolumeUp,
    CapsLock,
    NumLock,
    PrintScreen,
    ScrollLock,
}

// Rust has no subtyping relation between closed enums. These source aliases keep their public
// names while the single canonical enum carries the bounded key vocabulary.
pub type ShortcutDigitKeyName = ShortcutKeyName;
pub type ShortcutEditingKeyName = ShortcutKeyName;
pub type ShortcutFunctionKeyName = ShortcutKeyName;
pub type ShortcutLetterKeyName = ShortcutKeyName;
pub type ShortcutLockKeyName = ShortcutKeyName;
pub type ShortcutMediaKeyName = ShortcutKeyName;
pub type ShortcutNavigationKeyName = ShortcutKeyName;
pub type ShortcutNumpadKeyName = ShortcutKeyName;
pub type ShortcutPunctuationKeyName = ShortcutKeyName;

/// Caller-owned parse output (TS `ParsedAccelerator`). An empty `key` is the exact fresh-value
/// sentinel; every successful parse writes a string from the `ShortcutKeyName` table.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ParsedAccelerator {
    pub key: String,
    pub modifiers: Vec<ShortcutModifier>,
}

/// The reason field of `CreateGlobalShortcutOutcome`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CreateGlobalShortcutReason {
    Created,
    Unparseable,
}

/// Successful shortcut construction arm.
#[derive(Clone)]
pub struct CreateGlobalShortcutOutcomeCreated {
    pub shortcut: Ref<GlobalShortcut>,
}

/// Parse failure arm of shortcut construction.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreateGlobalShortcutOutcomeUnparseable {
    pub parse_error: AcceleratorParseError,
}

/// Result of constructing a shortcut after validating and normalizing its chord.
#[derive(Clone)]
pub enum CreateGlobalShortcutOutcome {
    Created(CreateGlobalShortcutOutcomeCreated),
    Unparseable(CreateGlobalShortcutOutcomeUnparseable),
}

/// The reason field of `GlobalShortcutAttachOutcome`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlobalShortcutAttachReason {
    AlreadyAttached,
    AlreadyRegistered,
    Attached,
    NativeRefused,
    RegistrationInProgress,
    TriggerProviderFailed,
}

/// Result of one global-shortcut attachment attempt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlobalShortcutAttachOutcome {
    pub reason: GlobalShortcutAttachReason,
}

/// The reason field of `GlobalShortcutDetachOutcome`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlobalShortcutDetachReason {
    Detached,
    NotAttached,
    TriggerProviderFailed,
}

/// Result of one global-shortcut detach or dispose attempt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlobalShortcutDetachOutcome {
    pub reason: GlobalShortcutDetachReason,
}

/// The reason field of `GlobalShortcutQueryOutcome`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GlobalShortcutQueryReason {
    NotRegistered,
    QueryProviderFailed,
    Registered,
    Unparseable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlobalShortcutQueryOutcomeNotRegistered {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlobalShortcutQueryOutcomeQueryProviderFailed {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GlobalShortcutQueryOutcomeRegistered {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlobalShortcutQueryOutcomeUnparseable {
    pub parse_error: AcceleratorParseError,
}

/// Registration-query result. Only the unparseable arm carries a diagnostic.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GlobalShortcutQueryOutcome {
    NotRegistered(GlobalShortcutQueryOutcomeNotRegistered),
    QueryProviderFailed(GlobalShortcutQueryOutcomeQueryProviderFailed),
    Registered(GlobalShortcutQueryOutcomeRegistered),
    Unparseable(GlobalShortcutQueryOutcomeUnparseable),
}

/// Opaque provider-owned registration token (TS `ShortcutTriggerSubscription`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ShortcutTriggerSubscription {
    runtime: EntityRuntimeSlot,
}

/// The reason field of `ShortcutTriggerSubscribeOutcome`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShortcutTriggerSubscribeReason {
    Refused,
    Subscribed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShortcutTriggerSubscribeOutcomeRefused {}

#[derive(Clone)]
pub struct ShortcutTriggerSubscribeOutcomeSubscribed {
    pub subscription: Ref<ShortcutTriggerSubscription>,
}

/// Provider result for one registration acquisition.
#[derive(Clone)]
pub enum ShortcutTriggerSubscribeOutcome {
    Refused(ShortcutTriggerSubscribeOutcomeRefused),
    Subscribed(ShortcutTriggerSubscribeOutcomeSubscribed),
}

/// The reason field of `ShortcutTriggerUnsubscribeOutcome`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShortcutTriggerUnsubscribeReason {
    UnknownSubscription,
    Unsubscribed,
}

/// Provider result for one exact-token release.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShortcutTriggerUnsubscribeOutcome {
    pub reason: ShortcutTriggerUnsubscribeReason,
}

/// Synchronous native-trigger delivery callback.
pub type ShortcutTriggerListener = Arc<dyn Fn() + Send + Sync>;

// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise carries unknown, including explicit null
pub type ShortcutTriggerDestroyResult = Result<(), Unknown>;
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise carries unknown, including explicit null
pub type ShortcutTriggerQueryResult = Result<bool, Unknown>;
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise carries unknown, including explicit null
pub type ShortcutTriggerSubscribeResult = Result<ShortcutTriggerSubscribeOutcome, Unknown>;
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise carries unknown, including explicit null
pub type ShortcutTriggerUnsubscribeResult = Result<ShortcutTriggerUnsubscribeOutcome, Unknown>;

pub type ShortcutTriggerDestroyFuture =
    Pin<Box<dyn Future<Output = ShortcutTriggerDestroyResult> + Send>>;
pub type ShortcutTriggerQueryFuture =
    Pin<Box<dyn Future<Output = ShortcutTriggerQueryResult> + Send>>;
pub type ShortcutTriggerSubscribeFuture =
    Pin<Box<dyn Future<Output = ShortcutTriggerSubscribeResult> + Send>>;
pub type ShortcutTriggerUnsubscribeFuture =
    Pin<Box<dyn Future<Output = ShortcutTriggerUnsubscribeResult> + Send>>;

/// Native registration and exact-token teardown (TS `HostShortcutTriggerCapability`).
#[derive(Clone)]
pub struct HostShortcutTriggerCapability {
    pub provider: ProviderRef,
    pub destroy: Arc<dyn Fn() -> ShortcutTriggerDestroyFuture + Send + Sync>,
    pub subscribe:
        Arc<dyn Fn(&str, ShortcutTriggerListener) -> ShortcutTriggerSubscribeFuture + Send + Sync>,
    pub unsubscribe: Arc<
        dyn Fn(&Ref<ShortcutTriggerSubscription>) -> ShortcutTriggerUnsubscribeFuture + Send + Sync,
    >,
}

/// Native registration query (TS `HostShortcutQueryCapability`).
#[derive(Clone)]
pub struct HostShortcutQueryCapability {
    pub provider: ProviderRef,
    pub is_registered: Arc<dyn Fn(&str) -> ShortcutTriggerQueryFuture + Send + Sync>,
}

/// Optional shortcut capability group (TS `HostShortcutCapabilities`).
#[derive(Clone, Default)]
pub struct HostShortcutCapabilities {
    pub query: Option<HostShortcutQueryCapability>,
    pub trigger: Option<HostShortcutTriggerCapability>,
}

/// One attached provider/token pair. The weak state reference prevents the state's strong
/// accelerator index from forming a cycle through the shortcut.
#[derive(Clone)]
pub(crate) struct GlobalShortcutAttachment {
    pub(crate) provider: HostShortcutTriggerCapability,
    pub(crate) registration_id: u64,
    pub(crate) state: Weak<Mutex<ShortcutStateData>>,
    pub(crate) subscription: Ref<ShortcutTriggerSubscription>,
}

/// One caller-owned global-hotkey registration (TS `GlobalShortcut`, an Entity).
#[derive(Default)]
pub struct GlobalShortcut {
    runtime: EntityRuntimeSlot,
    pub accelerator: Accelerator,
    pub on_trigger: Signal<()>,
    pub(crate) attachment: Option<GlobalShortcutAttachment>,
    pub(crate) pending_registration_id: Option<u64>,
}

/// Caller-owned replacement for the source module's attachment index and pending set. Clones share
/// one registration domain so independently held handles observe the same chord ownership.
#[derive(Clone, Default)]
pub struct ShortcutState {
    pub(crate) data: Arc<Mutex<ShortcutStateData>>,
}

#[derive(Default)]
pub(crate) struct ShortcutStateData {
    pub(crate) attached_by_accelerator: HashMap<Accelerator, Ref<GlobalShortcut>>,
    pub(crate) pending_accelerators: HashMap<Accelerator, u64>,
    pub(crate) next_registration_id: u64,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: provider/token runtime is intentionally opaque
impl fmt::Debug for GlobalShortcut {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("GlobalShortcut")
            .field("accelerator", &self.accelerator)
            .field("on_trigger", &self.on_trigger)
            .field("attached", &self.attachment.is_some())
            .field(
                "registration_pending",
                &self.pending_registration_id.is_some(),
            )
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: state internals are intentionally opaque
impl fmt::Debug for ShortcutState {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let data = self.data.lock().unwrap();
        return formatter
            .debug_struct("ShortcutState")
            .field("attached", &data.attached_by_accelerator.len())
            .field("pending", &data.pending_accelerators.len())
            .finish();
    }
}

flight_entity::impl_entity!(GlobalShortcut);
flight_entity::impl_entity!(ShortcutTriggerSubscription);
