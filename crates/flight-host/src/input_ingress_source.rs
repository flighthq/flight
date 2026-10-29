//! The host-neutral input source (HOST1, Principal A): host owns the structured
//! `InputIngressSource { provider, handle }`. Input attachments are keyed by the `Arc` identity of
//! `handle`, so two sources wrapping the same platform object are the same source.

use std::any::Any;
use std::sync::Arc;

use crate::provider_ref::ProviderRef;

/// The host-neutral identity of one input source. Attachments are keyed by the `Arc` identity of
/// `handle`.
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct InputIngressSource {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}
