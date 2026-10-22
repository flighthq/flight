use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};

struct NoopWake;

impl Wake for NoopWake {
    fn wake(self: Arc<Self>) {}
}

fn block_on<F: Future>(future: F) -> F::Output {
    let waker = Waker::from(Arc::new(NoopWake));
    let mut context = Context::from_waker(&waker);
    let mut future = Box::pin(future);
    loop {
        if let Poll::Ready(output) = Pin::new(&mut future).poll(&mut context) {
            return output;
        }
        std::thread::yield_now();
    }
}

#[path = "byte_reader_test.rs"]
mod flight_buffer_byte_reader_test;
#[path = "types_test.rs"]
mod flight_buffer_types_test;
