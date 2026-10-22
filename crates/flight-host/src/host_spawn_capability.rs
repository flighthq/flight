use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use crate::ProviderRef;

/// Host-owned execution for fire-and-forget async work. The SDK supplies the future, while the
/// host chooses and drives the executor. TS already drives promises, so this capability disappears
/// when generated Rust is lowered to TS.
#[derive(Clone)]
pub struct HostSpawnCapability {
    pub provider: ProviderRef,
    pub spawn: Arc<dyn Fn(Pin<Box<dyn Future<Output = ()> + Send>>) + Send + Sync>,
}
