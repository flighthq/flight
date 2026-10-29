//! flight-compiler: rust-only
use std::sync::Arc;

use crate::ProviderRef;

/// Cancellation owned by the timer provider. It maps to the matching `clearTimeout` or
/// `clearInterval` operation and deliberately exposes no provider-specific numeric timer id.
#[derive(Clone)]
pub struct TimerHandle {
    pub cancel: Arc<dyn Fn() + Send + Sync>,
}

/// Host-owned scheduling and wall-clock access. The provider must enqueue callbacks;
/// neither timeout nor interval callbacks may run inline. Timeout delays that are negative or
/// `NaN` are observed as zero, and interval delays below one millisecond (including `NaN`) are
/// observed as one millisecond.
// flight-lint: allow(f64) host timers and Date.now use JavaScript millisecond number precision
#[derive(Clone)]
pub struct HostTimerCapability {
    pub provider: ProviderRef,
    pub set_timeout: Arc<dyn Fn(f64, Arc<dyn Fn() + Send + Sync>) -> TimerHandle + Send + Sync>,
    pub set_interval: Arc<dyn Fn(f64, Arc<dyn Fn() + Send + Sync>) -> TimerHandle + Send + Sync>,
    pub now_ms: Arc<dyn Fn() -> f64 + Send + Sync>,
}
