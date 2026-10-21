use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError, Ref};
use flight_signals::Signal;

pub use flight_hostcapability::ProviderRef;

/// One of the three source structural alternatives; no discriminator is added to payload fields.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ShareContent {
    Title(ShareTitleContent),
    Text(ShareTextContent),
    Url(ShareUrlContent),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShareTitleContent {
    pub text: Option<String>,
    pub title: String,
    pub url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShareTextContent {
    pub text: String,
    pub title: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShareUrlContent {
    pub text: Option<String>,
    pub title: Option<String>,
    pub url: String,
}

/// Portable descriptors stay plain data; Ref at the command boundary preserves their identity.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShareFile {
    pub name: String,
    pub mime_type: String,
    pub data_url: String,
}

/// Core constructs this record only after validating a nonempty file sequence.
#[derive(Clone, Debug)]
pub struct ShareFilesContent {
    pub files: Vec<Ref<ShareFile>>,
    pub text: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
}

/// Plain provider outcome; activity_type None is source null, never an empty-string substitute.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShareResult {
    pub completed: bool,
    pub activity_type: Option<String>,
    pub dismissed: bool,
}

// flight-lint: allow(contract-vocabulary) D15/D10: explicit FlightError preserves a rejected provider Promise, as in IPC/connectivity
pub type ShareCommandResult = Result<bool, FlightError>;

// flight-lint: allow(contract-vocabulary) D15/D10: the resolved provider object or its unchanged Promise rejection
pub type ShareOutcome = Result<Ref<ShareResult>, FlightError>;

pub type ShareBoolFuture = Pin<Box<dyn Future<Output = ShareCommandResult> + Send>>;
pub type ShareResultFuture = Pin<Box<dyn Future<Output = ShareOutcome> + Send>>;

#[derive(Clone)]
pub struct HostShareContentCapability {
    pub provider: ProviderRef,
    pub can_share_content: Arc<dyn Fn(Ref<ShareContent>) -> bool + Send + Sync>,
    pub share_content: Arc<dyn Fn(Ref<ShareContent>) -> ShareBoolFuture + Send + Sync>,
    pub share_content_with_result:
        Arc<dyn Fn(Ref<ShareContent>) -> ShareResultFuture + Send + Sync>,
}

#[derive(Clone)]
pub struct HostShareFilesCapability {
    pub provider: ProviderRef,
    pub can_share_content: Arc<dyn Fn(Ref<ShareFilesContent>) -> bool + Send + Sync>,
    pub share_content: Arc<dyn Fn(Ref<ShareFilesContent>) -> ShareBoolFuture + Send + Sync>,
    pub share_content_with_result:
        Arc<dyn Fn(Ref<ShareFilesContent>) -> ShareResultFuture + Send + Sync>,
}

/// Capability absence stays distinct from a provider's false/dismissed/failed outcome.
#[derive(Clone, Default)]
pub struct HostShareCapabilities {
    pub content: Option<HostShareContentCapability>,
    pub files: Option<HostShareFilesCapability>,
}

#[derive(Debug, Default)]
pub struct ShareSignals {
    runtime: EntityRuntimeSlot,
    pub on_share_result: Signal<Ref<ShareResult>>,
}

/// D5 caller-owned replacement for the source ordered strong Set. Clones share one context.
#[derive(Clone, Default)]
pub struct ShareState {
    pub(crate) data: Ref<ShareStateData>,
}

#[derive(Default)]
pub(crate) struct ShareStateData {
    pub(crate) attachments: Vec<ShareAttachment>,
    pub(crate) next_order: usize,
}

pub(crate) struct ShareAttachment {
    pub(crate) uid: String,
    pub(crate) order: usize,
    pub(crate) signals: Ref<ShareSignals>,
}

flight_entity::impl_entity!(ShareSignals);
