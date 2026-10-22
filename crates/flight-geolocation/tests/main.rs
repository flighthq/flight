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

#[path = "geolocation_access_test.rs"]
mod flight_geolocation_geolocation_access_test;
#[path = "geolocation_test.rs"]
mod flight_geolocation_geolocation_test;
#[path = "host_explain_test.rs"]
mod flight_geolocation_host_explain_test;
#[path = "types_test.rs"]
mod flight_geolocation_types_test;
