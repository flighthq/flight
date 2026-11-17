// Drives a provider future across the C ABI without an executor. The future is polled inline on the
// calling thread; a future that is already resolved completes its callback before the FFI function
// returns. A pending future is re-polled on whichever thread wakes its `Waker` (the host provider
// that settles it), so the callback runs on that thread. Flight's provider futures are runtime-
// agnostic `Pin<Box<dyn Future + Send>>` values, so no host runtime is required beyond the provider
// eventually waking the future it returned.
use std::any::Any;
use std::future::Future;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};

#[cfg(test)]
mod tests {
    use std::future::{Future, ready};
    use std::pin::Pin;
    use std::sync::mpsc::channel;
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll, Waker};

    use super::*;

    // A provider-shaped future settled later by whoever holds the shared slot.
    struct Deferred {
        slot: Arc<Mutex<(Option<u32>, Option<Waker>)>>,
    }

    impl Future for Deferred {
        type Output = u32;

        fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<u32> {
            let mut slot = self.slot.lock().unwrap();
            if let Some(value) = slot.0.take() {
                return Poll::Ready(value);
            }
            slot.1 = Some(context.waker().clone());
            return Poll::Pending;
        }
    }

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn take_c_string(text: *mut std::ffi::c_char) -> String {
        assert!(!text.is_null());
        return unsafe { std::ffi::CString::from_raw(text) }
            .into_string()
            .unwrap();
    }

    mod drive_ffi_async {
        use super::*;

        #[test]
        fn completes_a_ready_future_before_returning() {
            let done = Arc::new(Mutex::new(None));
            let sink = Arc::clone(&done);
            drive_ffi_async(Box::pin(async move {
                *sink.lock().unwrap() = Some(ready(7u32).await);
            }));
            assert_eq!(*done.lock().unwrap(), Some(7));
        }

        #[test]
        fn completes_a_pending_future_on_the_waking_thread() {
            let slot = Arc::new(Mutex::new((None, None)));
            let future = Deferred {
                slot: Arc::clone(&slot),
            };
            let (sender, receiver) = channel();
            drive_ffi_async(Box::pin(async move {
                let value = future.await;
                sender.send((value, std::thread::current().id())).unwrap();
            }));
            assert!(receiver.try_recv().is_err());
            let settler = std::thread::spawn(move || {
                let waker = {
                    let mut slot = slot.lock().unwrap();
                    slot.0 = Some(42);
                    slot.1.take().unwrap()
                };
                waker.wake();
                return std::thread::current().id();
            });
            let settler_id = settler.join().unwrap();
            let (value, completed_on) = receiver.recv().unwrap();
            assert_eq!(value, 42);
            assert_eq!(completed_on, settler_id);
        }
    }

    // What one `complete_fn` call delivered to its `complete_ctx`.
    struct Completion {
        calls: u32,
        value: *mut std::ffi::c_void,
        error: *mut std::ffi::c_char,
    }

    extern "C" fn record_completion(
        ctx: *mut std::ffi::c_void,
        value: *mut std::ffi::c_void,
        error: *mut std::ffi::c_char,
    ) {
        let completion = unsafe { &mut *(ctx as *mut Completion) };
        completion.calls += 1;
        completion.value = value;
        completion.error = error;
    }

    fn completion() -> Completion {
        return Completion {
            calls: 0,
            value: std::ptr::null_mut(),
            error: std::ptr::null_mut(),
        };
    }

    fn completion_ctx(completion: &mut Completion) -> *mut std::ffi::c_void {
        return completion as *mut Completion as *mut std::ffi::c_void;
    }

    fn file_bytes() -> Box<[u8]> {
        return vec![10u8, 20, 30, 40, 50].into_boxed_slice();
    }

    // A file system whose binary reads answer `file_bytes()` (or the requested range of it), except
    // for `/missing` (absent) and `/panic` (the provider panics before returning a future).
    fn binary_host() -> flight_sdk::HostFileSystemCapability {
        return flight_sdk::HostFileSystemCapability {
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
            read_binary_file: Some(Arc::new(|path, _signal| {
                if path == "/panic" {
                    flight_sdk::throw_type_error("provider failed");
                }
                let bytes = (path != "/missing").then(file_bytes);
                return Box::pin(ready(Ok(bytes)));
            })),
            read_binary_file_range: Some(Arc::new(|_path, offset, length, _signal| {
                let bytes = file_bytes()[offset..offset + length]
                    .to_vec()
                    .into_boxed_slice();
                return Box::pin(ready(Ok(Some(bytes))));
            })),
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

    // Reads a delivered `Box<[u8]>` result through the generated len/get helpers, then frees it.
    fn take_bytes(
        result: *mut std::ffi::c_void,
        len: unsafe extern "C" fn(*const std::ffi::c_void) -> usize,
        get: unsafe extern "C" fn(*const std::ffi::c_void, usize) -> *const u8,
        free: unsafe extern "C" fn(*mut std::ffi::c_void),
    ) -> Vec<u8> {
        assert!(!result.is_null());
        let count = unsafe { len(result) };
        assert!(unsafe { get(result, count) }.is_null());
        let base = unsafe { get(result, 0) };
        let bytes = unsafe { std::slice::from_raw_parts(base, count) }.to_vec();
        unsafe { free(result) };
        return bytes;
    }

    mod flight_read_binary_file {
        use super::*;

        #[test]
        fn completes_a_construction_panic_once_with_its_error() {
            let host = binary_host();
            let mut completion = completion();
            unsafe {
                crate::flight_read_binary_file(
                    &host,
                    c"/panic".as_ptr(),
                    std::ptr::null(),
                    record_completion,
                    completion_ctx(&mut completion),
                );
            }
            assert_eq!(completion.calls, 1);
            assert!(completion.value.is_null());
            assert_eq!(
                take_c_string(completion.error),
                "TypeError: provider failed"
            );
        }

        #[test]
        fn delivers_a_null_result_for_an_absent_file() {
            let host = binary_host();
            let mut completion = completion();
            unsafe {
                crate::flight_read_binary_file(
                    &host,
                    c"/missing".as_ptr(),
                    std::ptr::null(),
                    record_completion,
                    completion_ctx(&mut completion),
                );
            }
            assert_eq!(completion.calls, 1);
            assert!(completion.value.is_null());
            assert!(completion.error.is_null());
            assert_eq!(
                unsafe { crate::flight_read_binary_file_result_len(completion.value) },
                0
            );
        }

        #[test]
        fn delivers_bytes_readable_through_the_result_helpers() {
            let host = binary_host();
            let mut completion = completion();
            unsafe {
                crate::flight_read_binary_file(
                    &host,
                    c"/a".as_ptr(),
                    std::ptr::null(),
                    record_completion,
                    completion_ctx(&mut completion),
                );
            }
            assert_eq!(completion.calls, 1);
            assert!(completion.error.is_null());
            let bytes = take_bytes(
                completion.value,
                crate::flight_read_binary_file_result_len,
                crate::flight_read_binary_file_result_get,
                crate::flight_read_binary_file_result_free,
            );
            assert_eq!(bytes, [10, 20, 30, 40, 50]);
        }
    }

    mod flight_read_binary_file_range {
        use super::*;

        #[test]
        fn delivers_the_requested_range() {
            let host = binary_host();
            let mut completion = completion();
            unsafe {
                crate::flight_read_binary_file_range(
                    &host,
                    c"/a".as_ptr(),
                    1,
                    3,
                    std::ptr::null(),
                    record_completion,
                    completion_ctx(&mut completion),
                );
            }
            assert_eq!(completion.calls, 1);
            assert!(completion.error.is_null());
            let bytes = take_bytes(
                completion.value,
                crate::flight_read_binary_file_range_result_len,
                crate::flight_read_binary_file_range_result_get,
                crate::flight_read_binary_file_range_result_free,
            );
            assert_eq!(bytes, [20, 30, 40]);
        }
    }

    mod flight_read_dialog_handle_binary_file {
        use super::*;

        #[test]
        fn reads_a_path_backed_handle_through_the_host() {
            let host = binary_host();
            let handle = flight_sdk::create_file_dialog_handle(
                flight_sdk::FileDialogHandleKind::File,
                "a",
                Some("/a"),
                None,
            );
            let mut completion = completion();
            unsafe {
                crate::flight_read_dialog_handle_binary_file(
                    &host,
                    &handle as *const flight_sdk::Ref<flight_sdk::FileDialogHandle>
                        as *const std::ffi::c_void,
                    std::ptr::null(),
                    record_completion,
                    completion_ctx(&mut completion),
                );
            }
            assert_eq!(completion.calls, 1);
            assert!(completion.error.is_null());
            let bytes = take_bytes(
                completion.value,
                crate::flight_read_dialog_handle_binary_file_result_len,
                crate::flight_read_dialog_handle_binary_file_result_get,
                crate::flight_read_dialog_handle_binary_file_result_free,
            );
            assert_eq!(bytes, file_bytes().to_vec());
        }
    }

    mod get_ffi_async_error_string {
        use super::*;

        #[test]
        fn formats_kind_and_message() {
            let error = flight_sdk::FlightError {
                kind: flight_sdk::FlightErrorKind::NotSupportedError,
                message: "no host".to_string(),
            };
            assert_eq!(
                take_c_string(get_ffi_async_error_string(&error)),
                "NotSupportedError: no host"
            );
        }
    }

    mod settle_ffi_async {
        use super::*;

        fn settle_panic(raise: impl FnOnce() + Send + 'static) -> String {
            let future = async move {
                raise();
                return 0u32;
            };
            let Err(error) = block_on(settle_ffi_async(future)) else {
                panic!("a panicking future settles as an error");
            };
            return take_c_string(error);
        }

        #[test]
        fn passes_a_settled_output_through() {
            assert_eq!(block_on(settle_ffi_async(ready(5u32))).ok(), Some(5));
        }

        #[test]
        fn settles_a_typed_panic_as_its_error_string() {
            let text = settle_panic(|| flight_sdk::throw_type_error("bad path"));
            assert_eq!(text, "TypeError: bad path");
        }

        #[test]
        fn settles_a_thrown_abort_reason_as_its_string() {
            let text = settle_panic(|| {
                let reason: flight_sdk::Unknown = Some(Arc::new("aborted".to_string()));
                std::panic::panic_any(reason);
            });
            assert_eq!(text, "aborted");
        }

        #[test]
        fn settles_a_message_panic_as_its_text() {
            assert_eq!(settle_panic(|| panic!("broken host")), "broken host");
        }
    }
}

/// The caller's opaque `complete_ctx`, carried into the task. The caller owns it and guarantees it
/// stays valid, and is safe to hand to the callback from the waking thread, until the callback runs.
pub(crate) struct FfiAsyncContext(pub(crate) *mut std::ffi::c_void);

struct FfiAsyncTask {
    future: Mutex<Option<Pin<Box<dyn Future<Output = ()> + Send>>>>,
    // Set by a wake that found the task mid-poll, so the polling thread polls again instead of the
    // wake being lost.
    notified: AtomicBool,
}

/// Starts `task` and keeps it alive until it completes; the task owns its own completion callback.
pub(crate) fn drive_ffi_async(task: Pin<Box<dyn Future<Output = ()> + Send>>) {
    let task = Arc::new(FfiAsyncTask {
        future: Mutex::new(Some(task)),
        notified: AtomicBool::new(false),
    });
    poll_ffi_async_task(&task);
}

// A call (not a field read) so an `async move` block captures the whole Send wrapper.
pub(crate) fn get_ffi_async_context(context: &FfiAsyncContext) -> *mut std::ffi::c_void {
    return context.0;
}

/// A rejected provider future as an owned C string in the JS `String(error)` shape
/// (`"TypeError: message"`), released with `flight_free_string`.
pub(crate) fn get_ffi_async_error_string(error: &flight_sdk::FlightError) -> *mut std::ffi::c_char {
    let error: flight_sdk::Unknown = Some(Arc::new(error.clone()));
    return into_ffi_async_c_string(flight_sdk::unknown_to_js_string(&error));
}

pub(crate) fn get_ffi_async_panic_string(payload: Box<dyn Any + Send>) -> *mut std::ffi::c_char {
    // A thrown `Unknown` (an abort reason) is the rejection value itself; message panics carry text.
    let payload = match payload.downcast::<flight_sdk::Unknown>() {
        Ok(reason) => return into_ffi_async_c_string(flight_sdk::unknown_to_js_string(&reason)),
        Err(payload) => payload,
    };
    let payload = match payload.downcast::<String>() {
        Ok(message) => return into_ffi_async_c_string(*message),
        Err(payload) => payload,
    };
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return into_ffi_async_c_string((*message).to_string());
    }
    let error = flight_sdk::unknown_from_panic(payload);
    return into_ffi_async_c_string(flight_sdk::unknown_to_js_string(&error));
}

fn into_ffi_async_c_string(text: String) -> *mut std::ffi::c_char {
    return std::ffi::CString::new(text).unwrap_or_default().into_raw();
}

fn poll_ffi_async_task(task: &Arc<FfiAsyncTask>) {
    // A wake publishes `notified` before contending for the lock: either it wins the lock and
    // polls, or the current poller observes the flag after releasing the lock and polls again.
    task.notified.store(true, Ordering::SeqCst);
    loop {
        let Ok(mut slot) = task.future.try_lock() else {
            return;
        };
        task.notified.store(false, Ordering::SeqCst);
        if let Some(future) = slot.as_mut() {
            let waker = Waker::from(Arc::clone(task));
            let mut context = Context::from_waker(&waker);
            if let Poll::Ready(()) = future.as_mut().poll(&mut context) {
                *slot = None;
            }
        }
        let finished = slot.is_none();
        drop(slot);
        if finished || !task.notified.load(Ordering::SeqCst) {
            return;
        }
    }
}

/// `future` with a panic raised while polling it (Flight's typed-panic rejection, such as an
/// aborted signal) settled as an owned error string instead of unwinding through `extern "C"`.
pub(crate) fn settle_ffi_async<F: Future>(
    future: F,
) -> impl Future<Output = Result<F::Output, *mut std::ffi::c_char>> {
    let mut future = Box::pin(future);
    return std::future::poll_fn(move |context| {
        return match catch_unwind(AssertUnwindSafe(|| future.as_mut().poll(context))) {
            Ok(Poll::Ready(output)) => Poll::Ready(Ok(output)),
            Ok(Poll::Pending) => Poll::Pending,
            Err(payload) => Poll::Ready(Err(get_ffi_async_panic_string(payload))),
        };
    });
}

// SAFETY: the pointer is never dereferenced here; it is only passed back to the caller's callback,
// under the caller's own thread-safety contract for `complete_ctx`.
unsafe impl Send for FfiAsyncContext {}

impl Wake for FfiAsyncTask {
    fn wake(self: Arc<Self>) {
        poll_ffi_async_task(&self);
    }

    fn wake_by_ref(self: &Arc<Self>) {
        poll_ffi_async_task(self);
    }
}
