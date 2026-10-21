use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError, Ref, Uint8Array};
use flight_hostcapability::ProviderRef;
use flight_permissions::HostMidiPermissionCapability;
use flight_signals::Signal;
use flight_stream::SharedFuture;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiAccessDisposeReason {
    AlreadyDisposed,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiAccessPortsReason {
    Disposed,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiAccessRequestReason {
    Accepted,
    OperationFailed,
    PermissionDenied,
    SecurityRestricted,
    Unsupported,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiEventBackendAttachReason {
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiEventReleaseReason {
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiMessageSendReason {
    Disconnected,
    Disposed,
    InvalidMessage,
    NotOpen,
    OperationFailed,
    Sent,
    SystemExclusiveNotEnabled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortCloseReason {
    AlreadyClosed,
    Closed,
    Disposed,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortConnection {
    Closed,
    Open,
    Pending,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortConnectionOutcomeReason {
    Disposed,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortDisposeReason {
    AlreadyDisposed,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortLifecycleFailureOperation {
    Close,
    MessageSubscriptionRelease,
    StateSubscriptionRelease,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortOpenReason {
    AlreadyOpen,
    Disconnected,
    Disposed,
    Opened,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortState {
    Connected,
    Disconnected,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortStateOutcomeReason {
    Disposed,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiPortType {
    Input,
    Output,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiSubscriptionAttachReason {
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiSubscriptionDetachReason {
    NotAttached,
    Ok,
    OperationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MidiSubscriptionDisposeReason {
    AlreadyDisposed,
    Ok,
    OperationFailed,
}

#[derive(Default)]
pub struct MidiAccess {
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiAccessLifecycleFailure {
    pub id: Option<String>,
    pub operation: MidiPortLifecycleFailureOperation,
    pub type_: Option<MidiPortType>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiAccessDisposeOutcome {
    pub failures: Option<Vec<MidiAccessLifecycleFailure>>,
    pub reason: MidiAccessDisposeReason,
}

#[derive(Clone, Debug)]
pub struct MidiAccessPortsOutcome<Port> {
    pub ports: Option<Vec<Ref<Port>>>,
    pub reason: MidiAccessPortsReason,
}

#[derive(Clone, Debug)]
pub struct MidiAccessRequestOutcome {
    pub access: Option<Ref<MidiAccess>>,
    pub reason: MidiAccessRequestReason,
}

#[derive(Clone, Debug)]
pub struct MidiEventBackendAttachOutcome {
    pub attachment: Option<Ref<MidiEventAttachment>>,
    pub reason: MidiEventBackendAttachReason,
    pub release_failed: Option<bool>,
}

#[derive(Default)]
pub struct MidiEventAttachment {
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiEventReleaseOutcome {
    pub reason: MidiEventReleaseReason,
}

#[derive(Default)]
pub struct MidiInputMessageSubscription {
    runtime: EntityRuntimeSlot,
    pub on_midi_input_message: Signal<MidiInputMessage>,
}

// flight-lint: allow(f64) D1: Web MIDI event timestamps are millisecond time values and the source preserves fractional milliseconds
#[derive(Clone, Debug, PartialEq)]
pub struct MidiInputMessage {
    pub data: Box<Uint8Array>,
    pub timestamp: f64,
}

#[derive(Default)]
pub struct MidiInputPort {
    runtime: EntityRuntimeSlot,
    pub id: String,
    pub manufacturer: Option<String>,
    pub name: Option<String>,
    pub type_: MidiPortType,
    pub version: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiMessageSendOutcome {
    pub reason: MidiMessageSendReason,
}

#[derive(Default)]
pub struct MidiOutputPort {
    runtime: EntityRuntimeSlot,
    pub id: String,
    pub manufacturer: Option<String>,
    pub name: Option<String>,
    pub type_: MidiPortType,
    pub version: Option<String>,
}

#[derive(Clone)]
// flight-lint: allow(enum-payload-named) D2: the source MidiPort union directly carries one of the two Entity identities; wrapper payload records would invent contract types
pub enum MidiPort {
    Input(Ref<MidiInputPort>),
    Output(Ref<MidiOutputPort>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiPortCloseOutcome {
    pub reason: MidiPortCloseReason,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiPortConnectionOutcome {
    pub connection: Option<MidiPortConnection>,
    pub reason: MidiPortConnectionOutcomeReason,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiPortDisposeOutcome {
    pub failures: Option<Vec<MidiPortLifecycleFailure>>,
    pub reason: MidiPortDisposeReason,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiPortLifecycleFailure {
    pub operation: MidiPortLifecycleFailureOperation,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiPortMetadata {
    pub id: String,
    pub manufacturer: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiPortOpenOutcome {
    pub reason: MidiPortOpenReason,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiPortStateOutcome {
    pub reason: MidiPortStateOutcomeReason,
    pub state: Option<MidiPortState>,
}

#[derive(Default)]
pub struct MidiPortStateSubscription {
    runtime: EntityRuntimeSlot,
    pub on_midi_port_state_change: Signal<MidiPort>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiSubscriptionAttachOutcome {
    pub attach_failed: Option<bool>,
    pub reason: MidiSubscriptionAttachReason,
    pub release_failed: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiSubscriptionDetachOutcome {
    pub reason: MidiSubscriptionDetachReason,
    pub release_failed: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MidiSubscriptionDisposeOutcome {
    pub attach_failed: Option<bool>,
    pub reason: MidiSubscriptionDisposeReason,
    pub release_failed: Option<bool>,
}

#[derive(Default)]
pub struct MidiAccessStateSubscription {
    runtime: EntityRuntimeSlot,
    pub on_midi_access_state_change: Signal<MidiPort>,
}

#[derive(Clone)]
pub struct HostMidiAccessCapability {
    pub provider: ProviderRef,
    pub request_access: Arc<dyn Fn() -> MidiAccessRequestFuture + Send + Sync>,
}

#[derive(Clone, Default)]
pub struct HostMidiCapabilities {
    pub access: Option<HostMidiAccessCapability>,
    pub permission: Option<HostMidiPermissionCapability>,
}

#[derive(Clone)]
pub struct MidiAccessResourceOperations {
    pub attach_state_change:
        Arc<dyn Fn(MidiAccessStateListener) -> MidiEventBackendAttachFuture + Send + Sync>,
    pub get_input_ports: Arc<dyn Fn() -> MidiInputPortsProviderResult + Send + Sync>,
    pub get_output_ports: Arc<dyn Fn() -> MidiOutputPortsProviderResult + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub struct MidiInputPortResourceOperations {
    pub attach_message:
        Arc<dyn Fn(MidiInputMessageListener) -> MidiEventBackendAttachFuture + Send + Sync>,
    pub attach_state_change:
        Arc<dyn Fn(MidiPortStateListener) -> MidiEventBackendAttachFuture + Send + Sync>,
    pub close: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
    pub get_connection: Arc<dyn Fn() -> MidiPortConnectionProviderResult + Send + Sync>,
    pub get_state: Arc<dyn Fn() -> MidiPortStateProviderResult + Send + Sync>,
    pub open: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
    pub provider: ProviderRef,
}

// flight-lint: allow(f64) D1: the optional Web MIDI send timestamp is a fractional millisecond value passed through unchanged
#[derive(Clone)]
pub struct MidiOutputPortResourceOperations {
    pub attach_state_change:
        Arc<dyn Fn(MidiPortStateListener) -> MidiEventBackendAttachFuture + Send + Sync>,
    pub close: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
    pub get_connection: Arc<dyn Fn() -> MidiPortConnectionProviderResult + Send + Sync>,
    pub get_state: Arc<dyn Fn() -> MidiPortStateProviderResult + Send + Sync>,
    pub open: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
    pub provider: ProviderRef,
    pub send: Arc<dyn Fn(Vec<u8>, Option<f64>) -> MidiSendProviderResult + Send + Sync>,
}

#[derive(Clone)]
pub struct MidiPortResourceOperations {
    pub attach_state_change:
        Arc<dyn Fn(MidiPortStateListener) -> MidiEventBackendAttachFuture + Send + Sync>,
    pub close: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
    pub get_connection: Arc<dyn Fn() -> MidiPortConnectionProviderResult + Send + Sync>,
    pub get_state: Arc<dyn Fn() -> MidiPortStateProviderResult + Send + Sync>,
    pub open: Arc<dyn Fn() -> MidiPortCommandFuture + Send + Sync>,
    pub provider: ProviderRef,
}

#[derive(Clone)]
pub(crate) struct MidiEventAttachmentRuntime {
    pub(crate) provider: ProviderRef,
    pub(crate) release: Arc<dyn Fn() -> MidiEventReleaseFuture + Send + Sync>,
}

pub struct MidiAccessResourceState {
    pub dispose_completed: bool,
    pub dispose_pending: Option<SharedFuture<MidiAccessDisposeOutcome>>,
    pub disposed: bool,
    pub known_ports: Vec<MidiPort>,
    pub operations: MidiAccessResourceOperations,
    pub subscriptions: Vec<Ref<MidiAccessStateSubscription>>,
    pub(crate) dispose_generation: u64,
}

pub struct MidiInputPortResourceState {
    pub dispose_completed: bool,
    pub dispose_pending: Option<SharedFuture<MidiPortDisposeOutcome>>,
    pub disposed: bool,
    pub flight_opened: bool,
    pub message_subscriptions: Vec<Ref<MidiInputMessageSubscription>>,
    pub operations: MidiInputPortResourceOperations,
    pub state_subscriptions: Vec<Ref<MidiPortStateSubscription>>,
    pub(crate) dispose_generation: u64,
}

pub struct MidiOutputPortResourceState {
    pub dispose_completed: bool,
    pub dispose_pending: Option<SharedFuture<MidiPortDisposeOutcome>>,
    pub disposed: bool,
    pub flight_opened: bool,
    pub operations: MidiOutputPortResourceOperations,
    pub state_subscriptions: Vec<Ref<MidiPortStateSubscription>>,
    pub(crate) dispose_generation: u64,
}

pub enum MidiPortResourceState {
    Input(MidiInputPortResourceState),
    Output(MidiOutputPortResourceState),
}

pub(crate) struct MidiSubscriptionRuntime {
    pub(crate) attachment: Option<Ref<MidiEventAttachment>>,
    pub(crate) attaching: Option<SharedFuture<MidiSubscriptionAttachOutcome>>,
    pub(crate) attaching_generation: Option<u64>,
    pub(crate) dispose_completed: bool,
    pub(crate) disposed: bool,
    pub(crate) generation: u64,
    pub(crate) untrack: Option<Arc<dyn Fn() + Send + Sync>>,
}

// flight-lint: allow(contract-vocabulary) D15/D10: Result models a rejected requestAccess Promise so request_midi_access can catch it
pub type MidiAccessRequestProviderResult = Result<MidiAccessRequestOutcome, FlightError>;
pub type MidiAccessRequestFuture =
    Pin<Box<dyn Future<Output = MidiAccessRequestProviderResult> + Send>>;
pub type MidiAccessStateListener = Arc<dyn Fn(&MidiPort) + Send + Sync>;
// flight-lint: allow(contract-vocabulary) D15/D10: Result models a rejected provider attach Promise so the subscription facade can project it
pub type MidiEventBackendAttachProviderResult = Result<MidiEventBackendAttachOutcome, FlightError>;
pub type MidiEventBackendAttachFuture =
    Pin<Box<dyn Future<Output = MidiEventBackendAttachProviderResult> + Send>>;
// flight-lint: allow(contract-vocabulary) D15/D10: Result models a rejected attachment release Promise so detach can retain it for retry
pub type MidiEventReleaseProviderResult = Result<MidiEventReleaseOutcome, FlightError>;
pub type MidiEventReleaseFuture =
    Pin<Box<dyn Future<Output = MidiEventReleaseProviderResult> + Send>>;
// flight-lint: allow(contract-vocabulary) D10: a synchronous provider read can fail where the TS source catches a thrown operation
pub type MidiInputPortsProviderResult = Result<Vec<Ref<MidiInputPort>>, FlightError>;
// flight-lint: allow(f64) D1: Web MIDI event timestamps are millisecond time values and the source preserves fractional milliseconds
pub type MidiInputMessageListener = Arc<dyn Fn(&Uint8Array, f64) + Send + Sync>;
// flight-lint: allow(contract-vocabulary) D10: a synchronous provider read can fail where the TS source catches a thrown operation
pub type MidiOutputPortsProviderResult = Result<Vec<Ref<MidiOutputPort>>, FlightError>;
// flight-lint: allow(contract-vocabulary) D15/D10: Result models a rejected open or close Promise caught by the facade
pub type MidiPortCommandResult = Result<(), FlightError>;
pub type MidiPortCommandFuture = Pin<Box<dyn Future<Output = MidiPortCommandResult> + Send>>;
// flight-lint: allow(contract-vocabulary) D10: a synchronous provider read can fail where the TS source catches a thrown operation
pub type MidiPortConnectionProviderResult = Result<MidiPortConnection, FlightError>;
pub type MidiPortStateListener = Arc<dyn Fn() + Send + Sync>;
// flight-lint: allow(contract-vocabulary) D10: a synchronous provider read can fail where the TS source catches a thrown operation
pub type MidiPortStateProviderResult = Result<MidiPortState, FlightError>;
// flight-lint: allow(contract-vocabulary) D10: a synchronous provider send can fail where the TS source catches a thrown operation
pub type MidiSendProviderResult = Result<(), FlightError>;

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiAccessDisposeOutcome reason union
pub fn get_midi_access_dispose_reason_string(value: MidiAccessDisposeReason) -> &'static str {
    return match value {
        MidiAccessDisposeReason::AlreadyDisposed => "already-disposed",
        MidiAccessDisposeReason::Ok => "ok",
        MidiAccessDisposeReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiAccessPortsOutcome reason union
pub fn get_midi_access_ports_reason_string(value: MidiAccessPortsReason) -> &'static str {
    return match value {
        MidiAccessPortsReason::Disposed => "disposed",
        MidiAccessPortsReason::Ok => "ok",
        MidiAccessPortsReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiAccessRequestOutcome reason union
pub fn get_midi_access_request_reason_string(value: MidiAccessRequestReason) -> &'static str {
    return match value {
        MidiAccessRequestReason::Accepted => "accepted",
        MidiAccessRequestReason::OperationFailed => "operation-failed",
        MidiAccessRequestReason::PermissionDenied => "permission-denied",
        MidiAccessRequestReason::SecurityRestricted => "security-restricted",
        MidiAccessRequestReason::Unsupported => "unsupported",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiEventBackendAttachOutcome reason union
pub fn get_midi_event_backend_attach_reason_string(
    value: MidiEventBackendAttachReason,
) -> &'static str {
    return match value {
        MidiEventBackendAttachReason::Ok => "ok",
        MidiEventBackendAttachReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiEventReleaseOutcome reason union
pub fn get_midi_event_release_reason_string(value: MidiEventReleaseReason) -> &'static str {
    return match value {
        MidiEventReleaseReason::Ok => "ok",
        MidiEventReleaseReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiMessageSendOutcome reason union
pub fn get_midi_message_send_reason_string(value: MidiMessageSendReason) -> &'static str {
    return match value {
        MidiMessageSendReason::Disconnected => "disconnected",
        MidiMessageSendReason::Disposed => "disposed",
        MidiMessageSendReason::InvalidMessage => "invalid-message",
        MidiMessageSendReason::NotOpen => "not-open",
        MidiMessageSendReason::OperationFailed => "operation-failed",
        MidiMessageSendReason::Sent => "sent",
        MidiMessageSendReason::SystemExclusiveNotEnabled => "system-exclusive-not-enabled",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortCloseOutcome reason union
pub fn get_midi_port_close_reason_string(value: MidiPortCloseReason) -> &'static str {
    return match value {
        MidiPortCloseReason::AlreadyClosed => "already-closed",
        MidiPortCloseReason::Closed => "closed",
        MidiPortCloseReason::Disposed => "disposed",
        MidiPortCloseReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortConnectionOutcome reason union
pub fn get_midi_port_connection_outcome_reason_string(
    value: MidiPortConnectionOutcomeReason,
) -> &'static str {
    return match value {
        MidiPortConnectionOutcomeReason::Disposed => "disposed",
        MidiPortConnectionOutcomeReason::Ok => "ok",
        MidiPortConnectionOutcomeReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortConnection string union
pub fn get_midi_port_connection_string(value: MidiPortConnection) -> &'static str {
    return match value {
        MidiPortConnection::Closed => "closed",
        MidiPortConnection::Open => "open",
        MidiPortConnection::Pending => "pending",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortDisposeOutcome reason union
pub fn get_midi_port_dispose_reason_string(value: MidiPortDisposeReason) -> &'static str {
    return match value {
        MidiPortDisposeReason::AlreadyDisposed => "already-disposed",
        MidiPortDisposeReason::Ok => "ok",
        MidiPortDisposeReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortLifecycleFailure operation union
pub fn get_midi_port_lifecycle_failure_operation_string(
    value: MidiPortLifecycleFailureOperation,
) -> &'static str {
    return match value {
        MidiPortLifecycleFailureOperation::Close => "close",
        MidiPortLifecycleFailureOperation::MessageSubscriptionRelease => {
            "message-subscription-release"
        }
        MidiPortLifecycleFailureOperation::StateSubscriptionRelease => "state-subscription-release",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortOpenOutcome reason union
pub fn get_midi_port_open_reason_string(value: MidiPortOpenReason) -> &'static str {
    return match value {
        MidiPortOpenReason::AlreadyOpen => "already-open",
        MidiPortOpenReason::Disconnected => "disconnected",
        MidiPortOpenReason::Disposed => "disposed",
        MidiPortOpenReason::Opened => "opened",
        MidiPortOpenReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortStateOutcome reason union
pub fn get_midi_port_state_outcome_reason_string(
    value: MidiPortStateOutcomeReason,
) -> &'static str {
    return match value {
        MidiPortStateOutcomeReason::Disposed => "disposed",
        MidiPortStateOutcomeReason::Ok => "ok",
        MidiPortStateOutcomeReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPortState string union
pub fn get_midi_port_state_string(value: MidiPortState) -> &'static str {
    return match value {
        MidiPortState::Connected => "connected",
        MidiPortState::Disconnected => "disconnected",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiPort type literals
pub fn get_midi_port_type_string(value: MidiPortType) -> &'static str {
    return match value {
        MidiPortType::Input => "input",
        MidiPortType::Output => "output",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiSubscriptionAttachOutcome reason union
pub fn get_midi_subscription_attach_reason_string(
    value: MidiSubscriptionAttachReason,
) -> &'static str {
    return match value {
        MidiSubscriptionAttachReason::Ok => "ok",
        MidiSubscriptionAttachReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiSubscriptionDetachOutcome reason union
pub fn get_midi_subscription_detach_reason_string(
    value: MidiSubscriptionDetachReason,
) -> &'static str {
    return match value {
        MidiSubscriptionDetachReason::NotAttached => "not-attached",
        MidiSubscriptionDetachReason::Ok => "ok",
        MidiSubscriptionDetachReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string table for the TS MidiSubscriptionDisposeOutcome reason union
pub fn get_midi_subscription_dispose_reason_string(
    value: MidiSubscriptionDisposeReason,
) -> &'static str {
    return match value {
        MidiSubscriptionDisposeReason::AlreadyDisposed => "already-disposed",
        MidiSubscriptionDisposeReason::Ok => "ok",
        MidiSubscriptionDisposeReason::OperationFailed => "operation-failed",
    };
}

// Parsers stay contract-only and accept only the exact closed strings above.
// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiAccessDisposeOutcome reason union
pub fn parse_midi_access_dispose_reason(value: &str) -> Option<MidiAccessDisposeReason> {
    return match value {
        "already-disposed" => Some(MidiAccessDisposeReason::AlreadyDisposed),
        "ok" => Some(MidiAccessDisposeReason::Ok),
        "operation-failed" => Some(MidiAccessDisposeReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiAccessPortsOutcome reason union
pub fn parse_midi_access_ports_reason(value: &str) -> Option<MidiAccessPortsReason> {
    return match value {
        "disposed" => Some(MidiAccessPortsReason::Disposed),
        "ok" => Some(MidiAccessPortsReason::Ok),
        "operation-failed" => Some(MidiAccessPortsReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiAccessRequestOutcome reason union
pub fn parse_midi_access_request_reason(value: &str) -> Option<MidiAccessRequestReason> {
    return match value {
        "accepted" => Some(MidiAccessRequestReason::Accepted),
        "operation-failed" => Some(MidiAccessRequestReason::OperationFailed),
        "permission-denied" => Some(MidiAccessRequestReason::PermissionDenied),
        "security-restricted" => Some(MidiAccessRequestReason::SecurityRestricted),
        "unsupported" => Some(MidiAccessRequestReason::Unsupported),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiEventBackendAttachOutcome reason union
pub fn parse_midi_event_backend_attach_reason(value: &str) -> Option<MidiEventBackendAttachReason> {
    return match value {
        "ok" => Some(MidiEventBackendAttachReason::Ok),
        "operation-failed" => Some(MidiEventBackendAttachReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiEventReleaseOutcome reason union
pub fn parse_midi_event_release_reason(value: &str) -> Option<MidiEventReleaseReason> {
    return match value {
        "ok" => Some(MidiEventReleaseReason::Ok),
        "operation-failed" => Some(MidiEventReleaseReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiMessageSendOutcome reason union
pub fn parse_midi_message_send_reason(value: &str) -> Option<MidiMessageSendReason> {
    return match value {
        "disconnected" => Some(MidiMessageSendReason::Disconnected),
        "disposed" => Some(MidiMessageSendReason::Disposed),
        "invalid-message" => Some(MidiMessageSendReason::InvalidMessage),
        "not-open" => Some(MidiMessageSendReason::NotOpen),
        "operation-failed" => Some(MidiMessageSendReason::OperationFailed),
        "sent" => Some(MidiMessageSendReason::Sent),
        "system-exclusive-not-enabled" => Some(MidiMessageSendReason::SystemExclusiveNotEnabled),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortCloseOutcome reason union
pub fn parse_midi_port_close_reason(value: &str) -> Option<MidiPortCloseReason> {
    return match value {
        "already-closed" => Some(MidiPortCloseReason::AlreadyClosed),
        "closed" => Some(MidiPortCloseReason::Closed),
        "disposed" => Some(MidiPortCloseReason::Disposed),
        "operation-failed" => Some(MidiPortCloseReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortConnection string union
pub fn parse_midi_port_connection(value: &str) -> Option<MidiPortConnection> {
    return match value {
        "closed" => Some(MidiPortConnection::Closed),
        "open" => Some(MidiPortConnection::Open),
        "pending" => Some(MidiPortConnection::Pending),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortConnectionOutcome reason union
pub fn parse_midi_port_connection_outcome_reason(
    value: &str,
) -> Option<MidiPortConnectionOutcomeReason> {
    return match value {
        "disposed" => Some(MidiPortConnectionOutcomeReason::Disposed),
        "ok" => Some(MidiPortConnectionOutcomeReason::Ok),
        "operation-failed" => Some(MidiPortConnectionOutcomeReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortDisposeOutcome reason union
pub fn parse_midi_port_dispose_reason(value: &str) -> Option<MidiPortDisposeReason> {
    return match value {
        "already-disposed" => Some(MidiPortDisposeReason::AlreadyDisposed),
        "ok" => Some(MidiPortDisposeReason::Ok),
        "operation-failed" => Some(MidiPortDisposeReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortLifecycleFailure operation union
pub fn parse_midi_port_lifecycle_failure_operation(
    value: &str,
) -> Option<MidiPortLifecycleFailureOperation> {
    return match value {
        "close" => Some(MidiPortLifecycleFailureOperation::Close),
        "message-subscription-release" => {
            Some(MidiPortLifecycleFailureOperation::MessageSubscriptionRelease)
        }
        "state-subscription-release" => {
            Some(MidiPortLifecycleFailureOperation::StateSubscriptionRelease)
        }
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortOpenOutcome reason union
pub fn parse_midi_port_open_reason(value: &str) -> Option<MidiPortOpenReason> {
    return match value {
        "already-open" => Some(MidiPortOpenReason::AlreadyOpen),
        "disconnected" => Some(MidiPortOpenReason::Disconnected),
        "disposed" => Some(MidiPortOpenReason::Disposed),
        "opened" => Some(MidiPortOpenReason::Opened),
        "operation-failed" => Some(MidiPortOpenReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortState string union
pub fn parse_midi_port_state(value: &str) -> Option<MidiPortState> {
    return match value {
        "connected" => Some(MidiPortState::Connected),
        "disconnected" => Some(MidiPortState::Disconnected),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPortStateOutcome reason union
pub fn parse_midi_port_state_outcome_reason(value: &str) -> Option<MidiPortStateOutcomeReason> {
    return match value {
        "disposed" => Some(MidiPortStateOutcomeReason::Disposed),
        "ok" => Some(MidiPortStateOutcomeReason::Ok),
        "operation-failed" => Some(MidiPortStateOutcomeReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiPort type literals
pub fn parse_midi_port_type(value: &str) -> Option<MidiPortType> {
    return match value {
        "input" => Some(MidiPortType::Input),
        "output" => Some(MidiPortType::Output),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiSubscriptionAttachOutcome reason union
pub fn parse_midi_subscription_attach_reason(value: &str) -> Option<MidiSubscriptionAttachReason> {
    return match value {
        "ok" => Some(MidiSubscriptionAttachReason::Ok),
        "operation-failed" => Some(MidiSubscriptionAttachReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiSubscriptionDetachOutcome reason union
pub fn parse_midi_subscription_detach_reason(value: &str) -> Option<MidiSubscriptionDetachReason> {
    return match value {
        "not-attached" => Some(MidiSubscriptionDetachReason::NotAttached),
        "ok" => Some(MidiSubscriptionDetachReason::Ok),
        "operation-failed" => Some(MidiSubscriptionDetachReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS MidiSubscriptionDisposeOutcome reason union
pub fn parse_midi_subscription_dispose_reason(
    value: &str,
) -> Option<MidiSubscriptionDisposeReason> {
    return match value {
        "already-disposed" => Some(MidiSubscriptionDisposeReason::AlreadyDisposed),
        "ok" => Some(MidiSubscriptionDisposeReason::Ok),
        "operation-failed" => Some(MidiSubscriptionDisposeReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(sugar-delegates) trait equality preserves Ref identity for generic access-port outcomes
impl<Port> PartialEq for MidiAccessPortsOutcome<Port> {
    fn eq(&self, other: &Self) -> bool {
        if self.reason != other.reason {
            return false;
        }
        return match (&self.ports, &other.ports) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                a.len() == b.len() && a.iter().zip(b.iter()).all(|(a, b)| Arc::ptr_eq(a, b))
            }
            _ => false,
        };
    }
}

impl<Port> Eq for MidiAccessPortsOutcome<Port> {}

// flight-lint: allow(sugar-delegates) trait equality preserves the attachment Entity identity
impl PartialEq for MidiEventBackendAttachOutcome {
    fn eq(&self, other: &Self) -> bool {
        if self.reason != other.reason || self.release_failed != other.release_failed {
            return false;
        }
        return match (&self.attachment, &other.attachment) {
            (None, None) => true,
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            _ => false,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait equality preserves the access Entity identity
impl PartialEq for MidiAccessRequestOutcome {
    fn eq(&self, other: &Self) -> bool {
        if self.reason != other.reason {
            return false;
        }
        return match (&self.access, &other.access) {
            (None, None) => true,
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            _ => false,
        };
    }
}

impl Eq for MidiAccessRequestOutcome {}

// flight-lint: allow(sugar-delegates) trait equality is the direct identity comparison for the source Entity union
impl PartialEq for MidiPort {
    fn eq(&self, other: &Self) -> bool {
        return match (self, other) {
            (MidiPort::Input(a), MidiPort::Input(b)) => Arc::ptr_eq(a, b),
            (MidiPort::Output(a), MidiPort::Output(b)) => Arc::ptr_eq(a, b),
            _ => false,
        };
    }
}

impl Eq for MidiPort {}

impl fmt::Debug for MidiPort {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return match self {
            MidiPort::Input(_) => formatter.write_str("MidiPort::Input(..)"),
            MidiPort::Output(_) => formatter.write_str("MidiPort::Output(..)"),
        };
    }
}

impl fmt::Debug for MidiAccess {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str("MidiAccess(..)");
    }
}

impl fmt::Debug for MidiEventAttachment {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str("MidiEventAttachment(..)");
    }
}

impl Default for MidiPortType {
    fn default() -> Self {
        return MidiPortType::Input;
    }
}

flight_entity::impl_entity!(MidiAccess);
flight_entity::impl_entity!(MidiAccessStateSubscription);
flight_entity::impl_entity!(MidiEventAttachment);
flight_entity::impl_entity!(MidiInputMessageSubscription);
flight_entity::impl_entity!(MidiInputPort);
flight_entity::impl_entity!(MidiOutputPort);
flight_entity::impl_entity!(MidiPortStateSubscription);
