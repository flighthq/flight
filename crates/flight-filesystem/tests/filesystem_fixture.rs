use std::future::{Future, ready};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::Unknown;
use flight_filesystem::contract::*;
use flight_stream::{AbortController, AbortSignal, abort_controller, create_abort_controller};

pub fn aborted_controller(reason: &Unknown) -> AbortController {
    let controller = create_abort_controller();
    abort_controller(&controller, Some(reason.clone()));
    return controller;
}

pub fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
    }
}

/// A host carrying no file-system member (the source's `hostWith()`).
pub fn host_with() -> HostFileSystemCapability {
    return HostFileSystemCapability {
        provider: Arc::new(()),
        append_text_file: None,
        can_access_file: None,
        copy: None,
        directory_exists: None,
        file_exists: None,
        get_file_system_usage: None,
        make_directory: None,
        open_file_read_stream: None,
        open_file_write_stream: None,
        read_binary_file: None,
        read_binary_file_range: None,
        read_directory: None,
        read_directory_recursive: None,
        read_text_file: None,
        remove_directory: None,
        remove_file: None,
        rename: None,
        stat_file: None,
        write_binary_file: None,
        write_file_atomic: None,
        write_text_file: None,
    };
}

/// Polls `future` to its rejection-by-throw and returns the thrown abort reason.
pub fn rejection_reason<T>(future: FileSystemProviderFuture<T>) -> Unknown {
    let thrown = catch_unwind(AssertUnwindSafe(|| block_on(future)))
        .err()
        .expect("the future must reject");
    return thrown
        .downcast::<Unknown>()
        .map(|reason| *reason)
        .expect("the rejection is the abort reason");
}

pub fn same_reason(a: &Unknown, b: &Unknown) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        _ => false,
    };
}

/// A shared call log a mock provider writes into.
pub type CallLog<T> = Arc<Mutex<Vec<T>>>;

pub fn call_log<T>() -> CallLog<T> {
    return Arc::new(Mutex::new(Vec::new()));
}

pub fn ok<T: Send + 'static>(value: T) -> FileSystemProviderFuture<T> {
    return Box::pin(ready(Ok(value)));
}

pub fn signal_state(signal: Option<&AbortSignal>) -> Option<AbortSignal> {
    return signal.cloned();
}
