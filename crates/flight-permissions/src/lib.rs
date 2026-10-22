mod host_explain;
mod permission;
mod sugar;
mod types;

pub mod contract;

// Public lane: exactly the three functions exported by the pinned TS index plus the locally owned
// types needed to spell their signatures and capability records.
pub use contract::HostMidiPermissionCapability;
pub use contract::HostPermissionsCapabilities;
pub use contract::HostPermissionsCapability;
pub use contract::HostPreferencesPersistenceQueryCapability;
pub use contract::HostPreferencesPersistenceRequestCapability;
pub use contract::PermissionName;
pub use contract::PermissionQueryFailureReason;
pub use contract::PermissionQueryFuture;
pub use contract::PermissionQueryOutcome;
pub use contract::PermissionQueryProviderResult;
pub use contract::PermissionQueryReason;
pub use contract::PermissionRequestFailureReason;
pub use contract::PermissionRequestFuture;
pub use contract::PermissionRequestOutcome;
pub use contract::PermissionRequestProviderResult;
pub use contract::PermissionRequestReason;
pub use contract::PermissionState;
pub use contract::StoragePersistenceFuture;
pub use contract::StoragePersistenceOutcome;
pub use contract::StoragePersistenceOutcomeReason;
pub use contract::StoragePersistenceProviderResult;
pub use contract::get_permission_state;
pub use contract::get_permission_states;
pub use contract::request_permission;

#[cfg(test)]
pub(crate) mod test_support {
    use std::future::Future;
    use std::task::{Context, Poll, Waker};

    pub(crate) fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }
}
