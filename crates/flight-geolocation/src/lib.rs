mod geolocation;
mod geolocation_access;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` exports plus the locally owned types their signatures use.
pub use contract::clear_geolocation_watch;
pub use contract::create_geolocation_position;
pub use contract::get_current_geolocation_position;
pub use contract::get_current_geolocation_position_result;
pub use contract::get_geolocation_access_reason_string;
pub use contract::get_geolocation_error_reason_string;
pub use contract::initialize_geolocation_position;
pub use contract::is_geolocation_available;
pub use contract::parse_geolocation_access_reason;
pub use contract::parse_geolocation_error_reason;
pub use contract::prompt_for_geolocation_access;
pub use contract::watch_geolocation_position;

pub use contract::GeolocationAccessOutcome;
pub use contract::GeolocationAccessReason;
pub use contract::GeolocationErrorReason;
pub use contract::GeolocationPosition;
pub use contract::GeolocationPositionFuture;
pub use contract::GeolocationPositionResult;
pub use contract::GeolocationPositionResultFuture;
pub use contract::GeolocationPromptFuture;
pub use contract::GeolocationRequestOptions;
pub use contract::HostGeolocationCapabilities;
pub use contract::HostGeolocationCapability;

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
