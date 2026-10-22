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

#[path = "host_explain_test.rs"]
mod flight_menu_host_explain_test;
#[path = "menu_templates_test.rs"]
mod flight_menu_menu_templates_test;
#[path = "menu_test.rs"]
mod flight_menu_menu_test;
#[path = "menu_watch_test.rs"]
mod flight_menu_menu_watch_test;
#[path = "types_test.rs"]
mod flight_menu_types_test;
