mod types;
mod updater;

pub mod contract;

// Public lane: the three functions exported by pinned TS `index.ts`, plus the locally owned types
// their signatures use. `create_downloaded_update` is the Rust-only D12 construction seam host
// adapters need; string helpers and the initializer stay contract-only.
pub use contract::check_for_app_update;
pub use contract::create_downloaded_update;
pub use contract::destroy_updater;
pub use contract::install_downloaded_update;

pub use contract::AppUpdateCheckFuture;
pub use contract::AppUpdateCheckOutcome;
pub use contract::AppUpdateCheckOutcomeCheckInProgress;
pub use contract::AppUpdateCheckOutcomeDownloaded;
pub use contract::AppUpdateCheckOutcomeNotAvailable;
pub use contract::AppUpdateCheckOutcomeOperationFailed;
pub use contract::AppUpdateCheckReason;
pub use contract::AppUpdateInstallFuture;
pub use contract::AppUpdateInstallOutcome;
pub use contract::AppUpdateInstallReason;
pub use contract::DownloadedUpdate;
pub use contract::HostUpdaterCapabilities;
pub use contract::HostUpdaterCommandCapability;
pub use contract::HostUpdaterCommandCapabilityMethods;
pub use contract::UpdateInfo;

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
