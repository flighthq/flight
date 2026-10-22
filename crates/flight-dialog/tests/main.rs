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

pub(crate) fn ok<T: Send + 'static>(value: T) -> flight_dialog::contract::DialogProviderFuture<T> {
    return Box::pin(std::future::ready(Ok(value)));
}

#[path = "dialog_test.rs"]
mod flight_dialog_dialog_test;
#[path = "file_dialog_test.rs"]
mod flight_dialog_file_dialog_test;
#[path = "host_explain_test.rs"]
mod flight_dialog_host_explain_test;
#[path = "media_dialog_test.rs"]
mod flight_dialog_media_dialog_test;
