mod abort;
mod stream;

pub mod contract;

pub use contract::AbortCallback;
pub use contract::AbortController;
pub use contract::AbortError;
pub use contract::AbortReason;
pub use contract::AbortSignal;
pub use contract::ReadableStream;
pub use contract::SharedFuture;
pub use contract::StreamResult;
pub use contract::WritableStream;
pub use contract::abort_controller;
pub use contract::add_abort_listener;
pub use contract::close_writable_stream;
pub use contract::create_abort_controller;
pub use contract::create_readable_stream;
pub use contract::create_shared_future;
pub use contract::create_writable_stream;
pub use contract::get_abort_signal_reason;
pub use contract::is_abort_signal_aborted;
pub use contract::read_readable_stream;
pub use contract::remove_abort_listener;
pub use contract::throw_if_aborted;
pub use contract::wait_aborted;
pub use contract::write_writable_stream;

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
