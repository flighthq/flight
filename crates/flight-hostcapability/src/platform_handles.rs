//! Host-provided opaque platform handles (D26 host vocabulary): objects the SDK passes but does not
//! define. Each is `{ provider, handle }`; `Arc` identity of `handle` is the platform object's
//! identity, and the backend that consumes it narrows `handle` to its native type. No GL or GPU
//! dependency lives here.

use std::any::Any;
use std::sync::Arc;

use crate::provider_ref::ProviderRef;

/// A GL backend's context (TS `GlContext`, a structural WebGL2 subset). The handle is a `Send`
/// token: a GL renderer builds its thread-bound native context from it on its own GL thread (D17).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct GlContext {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A configured WebGPU presentation context (TS `GPUCanvasContext`).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct GpuCanvasContext {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A WebGPU device (TS `GPUDevice`).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct GpuDevice {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}
