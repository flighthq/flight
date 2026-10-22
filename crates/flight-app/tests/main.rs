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

mod app_loop_test;
mod app_test;
mod app_window_test;
mod fixture;
mod host_explain_test;
mod window_fixture;
