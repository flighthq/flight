use std::future::Future;
use std::task::{Context, Poll, Waker};

pub(crate) use flight_app::contract;

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

mod fixture;
#[allow(dead_code)]
mod window_fixture;

#[path = "app_loop_test.rs"]
mod flight_app_app_loop_test;
#[path = "app_test.rs"]
mod flight_app_app_test;
#[path = "app_window_test.rs"]
mod flight_app_app_window_test;
#[path = "host_explain_test.rs"]
mod flight_app_host_explain_test;
