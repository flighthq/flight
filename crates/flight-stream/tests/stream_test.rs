use std::collections::VecDeque;
use std::future::Future;
use std::io;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};

use flight_entity::FlightErrorKind;
use flight_stream::contract::*;
use futures::io::{AsyncRead, AsyncWrite};

use crate::block_on;

enum ReadStep {
    Bytes(Vec<u8>),
    PendingThenBytes(Vec<u8>),
    Error(String),
}

struct MockReader {
    steps: Mutex<VecDeque<ReadStep>>,
    wake_slot: Arc<Mutex<Option<Waker>>>,
    dropped: Arc<AtomicBool>,
}

impl AsyncRead for MockReader {
    fn poll_read(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<io::Result<usize>> {
        let mut steps = self.steps.lock().unwrap();
        return match steps.pop_front() {
            None => Poll::Ready(Ok(0)),
            Some(ReadStep::Error(message)) => Poll::Ready(Err(io::Error::other(message))),
            Some(ReadStep::PendingThenBytes(bytes)) => {
                *self.wake_slot.lock().unwrap() = Some(context.waker().clone());
                steps.push_front(ReadStep::Bytes(bytes));
                Poll::Pending
            }
            Some(ReadStep::Bytes(bytes)) => {
                let count = bytes.len().min(buf.len());
                buf[..count].copy_from_slice(&bytes[..count]);
                if count < bytes.len() {
                    steps.push_front(ReadStep::Bytes(bytes[count..].to_vec()));
                }
                Poll::Ready(Ok(count))
            }
        };
    }
}

impl Drop for MockReader {
    fn drop(&mut self) {
        self.dropped.store(true, Ordering::SeqCst);
    }
}

fn mock_reader(steps: Vec<ReadStep>) -> (MockReader, Arc<AtomicBool>, Arc<Mutex<Option<Waker>>>) {
    let dropped = Arc::new(AtomicBool::new(false));
    let wake_slot = Arc::new(Mutex::new(None));
    return (
        MockReader {
            steps: Mutex::new(steps.into()),
            wake_slot: wake_slot.clone(),
            dropped: dropped.clone(),
        },
        dropped,
        wake_slot,
    );
}

struct MockWriter {
    capacity: usize,
    fail: bool,
    written: Arc<Mutex<Vec<u8>>>,
    closed: Arc<AtomicBool>,
    dropped: Arc<AtomicBool>,
}

impl AsyncWrite for MockWriter {
    fn poll_write(
        self: Pin<&mut Self>,
        _context: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        if self.fail {
            return Poll::Ready(Err(io::Error::other("write failed")));
        }
        let count = buf.len().min(self.capacity);
        self.written
            .lock()
            .unwrap()
            .extend_from_slice(&buf[..count]);
        return Poll::Ready(Ok(count));
    }

    fn poll_flush(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<io::Result<()>> {
        return Poll::Ready(Ok(()));
    }

    fn poll_close(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<io::Result<()>> {
        self.closed.store(true, Ordering::SeqCst);
        return Poll::Ready(Ok(()));
    }
}

impl Drop for MockWriter {
    fn drop(&mut self) {
        self.dropped.store(true, Ordering::SeqCst);
    }
}

fn mock_writer(
    capacity: usize,
    fail: bool,
) -> (
    MockWriter,
    Arc<Mutex<Vec<u8>>>,
    Arc<AtomicBool>,
    Arc<AtomicBool>,
) {
    let written = Arc::new(Mutex::new(Vec::new()));
    let closed = Arc::new(AtomicBool::new(false));
    let dropped = Arc::new(AtomicBool::new(false));
    return (
        MockWriter {
            capacity,
            fail,
            written: written.clone(),
            closed: closed.clone(),
            dropped: dropped.clone(),
        },
        written,
        closed,
        dropped,
    );
}

struct CountdownFuture {
    polls: Arc<AtomicUsize>,
    remaining: usize,
    value: i32,
}

impl Future for CountdownFuture {
    type Output = i32;

    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<i32> {
        let count = self.polls.fetch_add(1, Ordering::SeqCst) + 1;
        if count >= self.remaining {
            return Poll::Ready(self.value);
        }
        context.waker().wake_by_ref();
        return Poll::Pending;
    }
}

struct ManualFuture {
    ready: Arc<Mutex<bool>>,
    waker: Arc<Mutex<Option<Waker>>>,
    value: i32,
}

impl Future for ManualFuture {
    type Output = i32;

    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<i32> {
        if *self.ready.lock().unwrap() {
            return Poll::Ready(self.value);
        }
        *self.waker.lock().unwrap() = Some(context.waker().clone());
        return Poll::Pending;
    }
}

struct RecordingWake {
    woken: AtomicBool,
}

impl Wake for RecordingWake {
    fn wake(self: Arc<Self>) {
        self.woken.store(true, Ordering::SeqCst);
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.woken.store(true, Ordering::SeqCst);
    }
}

mod abort_writable_stream {
    use super::*;

    fn recording_hook(
        result: Result<(), flight_entity::Unknown>,
    ) -> (
        WritableStreamAbortHook,
        Arc<Mutex<Vec<Option<flight_entity::Unknown>>>>,
    ) {
        let seen: Arc<Mutex<Vec<Option<flight_entity::Unknown>>>> =
            Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let hook: WritableStreamAbortHook = Arc::new(move |reason| {
            record.lock().unwrap().push(reason);
            let result = result.clone();
            return Box::pin(async move { result });
        });
        return (hook, seen);
    }

    #[test]
    fn hands_the_hook_the_original_shared_reason() {
        let (writer, _written, _closed, _dropped) = mock_writer(8, false);
        let (hook, seen) = recording_hook(Ok(()));
        let reason: flight_entity::Unknown = Some(Arc::new("cancel".to_string()));
        let stream = create_writable_stream_with_abort(Box::new(writer), hook);
        assert!(block_on(abort_writable_stream(stream, Some(reason.clone()))).is_ok());
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert!(Arc::ptr_eq(
            seen[0].as_ref().unwrap().as_ref().unwrap(),
            reason.as_ref().unwrap()
        ));
    }

    #[test]
    fn distinguishes_an_omitted_reason_from_an_explicit_null() {
        let (writer_a, _wa, _ca, _da) = mock_writer(8, false);
        let (writer_b, _wb, _cb, _db) = mock_writer(8, false);
        let (hook, seen) = recording_hook(Ok(()));
        block_on(abort_writable_stream(
            create_writable_stream_with_abort(Box::new(writer_a), hook.clone()),
            None,
        ))
        .unwrap();
        block_on(abort_writable_stream(
            create_writable_stream_with_abort(Box::new(writer_b), hook),
            Some(None),
        ))
        .unwrap();
        let seen = seen.lock().unwrap();
        assert!(seen[0].is_none());
        assert!(matches!(seen[1], Some(None)));
    }

    #[test]
    fn returns_the_hook_rejection_with_its_identity() {
        let (writer, _written, _closed, _dropped) = mock_writer(8, false);
        let failure: flight_entity::Unknown = Some(Arc::new(7_u32));
        let (hook, _seen) = recording_hook(Err(failure.clone()));
        let stream = create_writable_stream_with_abort(Box::new(writer), hook);
        let error = block_on(abort_writable_stream(stream, None)).unwrap_err();
        assert!(Arc::ptr_eq(
            error.as_ref().unwrap(),
            failure.as_ref().unwrap()
        ));
    }

    #[test]
    fn drops_the_writer_only_after_the_hook_settles_and_never_closes_it() {
        let (writer, _written, closed, dropped) = mock_writer(8, false);
        let observed = Arc::new(Mutex::new(None));
        let observe = observed.clone();
        let watched = dropped.clone();
        let hook: WritableStreamAbortHook = Arc::new(move |_reason| {
            *observe.lock().unwrap() = Some(watched.load(Ordering::SeqCst));
            return Box::pin(async { Ok(()) });
        });
        let stream = create_writable_stream_with_abort(Box::new(writer), hook);
        block_on(abort_writable_stream(stream, None)).unwrap();
        assert_eq!(*observed.lock().unwrap(), Some(false));
        assert!(dropped.load(Ordering::SeqCst));
        assert!(!closed.load(Ordering::SeqCst));
    }

    #[test]
    fn without_a_hook_aborts_by_dropping_and_succeeds() {
        let (writer, _written, closed, dropped) = mock_writer(8, false);
        let stream = create_writable_stream(Box::new(writer));
        assert!(block_on(abort_writable_stream(stream, Some(Some(Arc::new(1_u8))))).is_ok());
        assert!(dropped.load(Ordering::SeqCst));
        assert!(!closed.load(Ordering::SeqCst));
    }
}

mod byte_chunk_stream {
    use super::*;

    #[test]
    fn keeps_chunk_boundaries_and_rejection_identity() {
        use futures::StreamExt;
        let failure: flight_entity::Unknown = Some(Arc::new("iterator failed".to_string()));
        let items: Vec<Result<Box<[u8]>, flight_entity::Unknown>> = vec![
            Ok(Box::new([1])),
            Ok(Box::new([2, 3])),
            Err(failure.clone()),
        ];
        let mut chunks: ByteChunkStream = Box::pin(futures::stream::iter(items));
        assert_eq!(block_on(chunks.next()).unwrap().unwrap().as_ref(), &[1]);
        assert_eq!(block_on(chunks.next()).unwrap().unwrap().as_ref(), &[2, 3]);
        let error = block_on(chunks.next()).unwrap().unwrap_err();
        assert!(Arc::ptr_eq(
            error.as_ref().unwrap(),
            failure.as_ref().unwrap()
        ));
        assert!(block_on(chunks.next()).is_none());
    }
}

mod close_writable_stream {
    use super::*;

    #[test]
    fn closes_the_writable_end() {
        let (writer, _written, closed, _dropped) = mock_writer(8, false);
        let mut stream = create_writable_stream(Box::new(writer));
        assert!(block_on(close_writable_stream(&mut stream)).is_ok());
        assert!(closed.load(Ordering::SeqCst));
    }
}

mod create_readable_stream {
    use super::*;

    #[test]
    fn reads_the_supplied_reader_and_drops_with_the_stream() {
        let (reader, dropped, _wake_slot) = mock_reader(vec![ReadStep::Bytes(b"ab".to_vec())]);
        let mut stream = create_readable_stream(Box::new(reader));
        let mut out = [0u8; 4];
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stream)), Ok(2));
        assert_eq!(&out[..2], b"ab");
        drop(stream);
        assert!(dropped.load(Ordering::SeqCst));
    }
}

mod create_shared_future {
    use super::*;

    #[test]
    fn every_clone_observes_one_result_and_the_operation_runs_once() {
        let polls = Arc::new(AtomicUsize::new(0));
        let shared = create_shared_future(Box::pin(CountdownFuture {
            polls: polls.clone(),
            remaining: 2,
            value: 7,
        }));
        assert_eq!(block_on(shared.clone()), 7);
        assert_eq!(block_on(shared.clone()), 7);
        assert_eq!(polls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn wakes_every_pending_observer_and_returns_the_same_value_to_each() {
        let ready = Arc::new(Mutex::new(false));
        let inner_waker = Arc::new(Mutex::new(None));
        let shared = create_shared_future(Box::pin(ManualFuture {
            ready: ready.clone(),
            waker: inner_waker.clone(),
            value: 9,
        }));
        let recorder_a = Arc::new(RecordingWake {
            woken: AtomicBool::new(false),
        });
        let recorder_b = Arc::new(RecordingWake {
            woken: AtomicBool::new(false),
        });
        let waker_a = Waker::from(recorder_a.clone());
        let waker_b = Waker::from(recorder_b.clone());
        let mut context_a = Context::from_waker(&waker_a);
        let mut context_b = Context::from_waker(&waker_b);
        let mut first = Box::pin(shared.clone());
        let mut second = Box::pin(shared.clone());
        assert!(first.as_mut().poll(&mut context_a).is_pending());
        assert!(second.as_mut().poll(&mut context_b).is_pending());
        *ready.lock().unwrap() = true;
        inner_waker
            .lock()
            .unwrap()
            .take()
            .expect("the shared operation registered a waker")
            .wake();
        assert!(recorder_a.woken.load(Ordering::SeqCst));
        assert!(recorder_b.woken.load(Ordering::SeqCst));
        assert_eq!(first.as_mut().poll(&mut context_a), Poll::Ready(9));
        assert_eq!(second.as_mut().poll(&mut context_b), Poll::Ready(9));
    }
}

mod create_writable_stream {
    use super::*;

    #[test]
    fn writes_through_the_supplied_writer_and_drops_with_the_stream() {
        let (writer, written, closed, dropped) = mock_writer(8, false);
        let mut stream = create_writable_stream(Box::new(writer));
        assert_eq!(
            block_on(write_writable_stream(&mut stream, b"abcdef")),
            Ok(6)
        );
        assert_eq!(&*written.lock().unwrap(), b"abcdef");
        drop(stream);
        assert!(dropped.load(Ordering::SeqCst));
        assert!(!closed.load(Ordering::SeqCst));
    }
}

mod create_writable_stream_with_abort {
    use super::*;

    #[test]
    fn writes_and_closes_like_a_hookless_stream() {
        let (writer, written, closed, _dropped) = mock_writer(8, false);
        let hook: WritableStreamAbortHook = Arc::new(|_reason| Box::pin(async { Ok(()) }));
        let mut stream = create_writable_stream_with_abort(Box::new(writer), hook);
        assert_eq!(block_on(write_writable_stream(&mut stream, b"ab")), Ok(2));
        assert_eq!(block_on(close_writable_stream(&mut stream)), Ok(()));
        assert_eq!(&*written.lock().unwrap(), b"ab");
        assert!(closed.load(Ordering::SeqCst));
    }

    #[test]
    fn never_invokes_the_hook_on_a_plain_drop() {
        let (writer, _written, _closed, dropped) = mock_writer(8, false);
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let hook: WritableStreamAbortHook = Arc::new(move |_reason| {
            count.fetch_add(1, Ordering::SeqCst);
            return Box::pin(async { Ok(()) });
        });
        drop(create_writable_stream_with_abort(Box::new(writer), hook));
        assert!(dropped.load(Ordering::SeqCst));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod read_readable_stream {
    use super::*;

    #[test]
    fn returns_partial_progress_and_end_of_stream() {
        let (reader, _dropped, _wake_slot) = mock_reader(vec![
            ReadStep::Bytes(b"ab".to_vec()),
            ReadStep::Bytes(b"cdef".to_vec()),
        ]);
        let mut stream = create_readable_stream(Box::new(reader));
        let mut out = [0u8; 3];
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stream)), Ok(2));
        assert_eq!(&out[..2], b"ab");
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stream)), Ok(3));
        assert_eq!(&out[..3], b"cde");
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stream)), Ok(1));
        assert_eq!(&out[..1], b"f");
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stream)), Ok(0));
    }

    #[test]
    fn pending_read_wakes_and_completes() {
        let (reader, _dropped, wake_slot) =
            mock_reader(vec![ReadStep::PendingThenBytes(b"xyz".to_vec())]);
        let mut stream = create_readable_stream(Box::new(reader));
        let mut out = [0u8; 4];
        let recorder = Arc::new(RecordingWake {
            woken: AtomicBool::new(false),
        });
        let waker = Waker::from(recorder.clone());
        let mut context = Context::from_waker(&waker);
        {
            let mut future = Box::pin(read_readable_stream(&mut out, &mut stream));
            assert!(future.as_mut().poll(&mut context).is_pending());
            wake_slot
                .lock()
                .unwrap()
                .take()
                .expect("the pending read registered a waker")
                .wake();
            assert!(recorder.woken.load(Ordering::SeqCst));
            assert_eq!(future.as_mut().poll(&mut context), Poll::Ready(Ok(3)));
        }
        assert_eq!(&out[..3], b"xyz");
    }

    #[test]
    fn maps_an_io_error_to_the_error_arm() {
        let (reader, _dropped, _wake_slot) =
            mock_reader(vec![ReadStep::Error("denied".to_string())]);
        let mut stream = create_readable_stream(Box::new(reader));
        let mut out = [0u8; 4];
        let error = block_on(read_readable_stream(&mut out, &mut stream))
            .expect_err("a failed read must report the error arm");
        assert_eq!(error.kind, FlightErrorKind::Error);
        assert_eq!(error.message, "denied");
    }
}

mod write_writable_stream {
    use super::*;

    #[test]
    fn reports_the_partial_count_the_provider_accepted() {
        let (writer, written, _closed, _dropped) = mock_writer(2, false);
        let mut stream = create_writable_stream(Box::new(writer));
        assert_eq!(block_on(write_writable_stream(&mut stream, b"abcd")), Ok(2));
        assert_eq!(&*written.lock().unwrap(), b"ab");
        assert_eq!(block_on(write_writable_stream(&mut stream, b"cd")), Ok(2));
        assert_eq!(&*written.lock().unwrap(), b"abcd");
    }

    #[test]
    fn maps_an_io_error_to_the_error_arm() {
        let (writer, _written, _closed, _dropped) = mock_writer(8, true);
        let mut stream = create_writable_stream(Box::new(writer));
        let error = block_on(write_writable_stream(&mut stream, b"data"))
            .expect_err("a failed write must report the error arm");
        assert_eq!(error.kind, FlightErrorKind::Error);
        assert_eq!(error.message, "write failed");
    }
}
