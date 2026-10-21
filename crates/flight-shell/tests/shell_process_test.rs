use std::future::Future;
use std::io;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll};

use flight_entity::Ref;
use flight_shell::*;
use flight_stream::{
    ReadableStream, SharedFuture, WritableStream, close_writable_stream, create_readable_stream,
    create_shared_future, create_writable_stream, read_readable_stream, write_writable_stream,
};
use futures::io::{AsyncRead, AsyncWrite};

use crate::block_on;

fn empty_readable() -> ReadableStream {
    return create_readable_stream(Box::new(futures::io::empty()));
}

fn empty_writable() -> WritableStream {
    return create_writable_stream(Box::new(futures::io::sink()));
}

fn exit_status(code: i32) -> SharedFuture<Ref<ShellProcessExitStatus>> {
    return create_shared_future(Box::pin(async move {
        Arc::new(RwLock::new(ShellProcessExitStatus {
            code: Some(code),
            signal: None,
        }))
    }));
}

struct ChunkReader {
    chunk: Mutex<Option<Vec<u8>>>,
}

impl AsyncRead for ChunkReader {
    fn poll_read(
        self: Pin<&mut Self>,
        _context: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<io::Result<usize>> {
        let Some(chunk) = self.chunk.lock().unwrap().take() else {
            return Poll::Ready(Ok(0));
        };
        let count = chunk.len().min(buf.len());
        buf[..count].copy_from_slice(&chunk[..count]);
        return Poll::Ready(Ok(count));
    }
}

struct RecordingWriter {
    written: Arc<Mutex<Vec<u8>>>,
    closed: Arc<AtomicBool>,
}

impl AsyncWrite for RecordingWriter {
    fn poll_write(
        self: Pin<&mut Self>,
        _context: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        self.written.lock().unwrap().extend_from_slice(buf);
        return Poll::Ready(Ok(buf.len()));
    }

    fn poll_flush(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<io::Result<()>> {
        return Poll::Ready(Ok(()));
    }

    fn poll_close(self: Pin<&mut Self>, _context: &mut Context<'_>) -> Poll<io::Result<()>> {
        self.closed.store(true, Ordering::SeqCst);
        return Poll::Ready(Ok(()));
    }
}

struct ExitCountdown {
    polls: Arc<AtomicUsize>,
    remaining: usize,
    status: Ref<ShellProcessExitStatus>,
}

impl Future for ExitCountdown {
    type Output = Ref<ShellProcessExitStatus>;

    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        let count = self.polls.fetch_add(1, Ordering::SeqCst) + 1;
        if count >= self.remaining {
            return Poll::Ready(self.status.clone());
        }
        context.waker().wake_by_ref();
        return Poll::Pending;
    }
}

mod create_shell_process {
    use super::*;

    #[test]
    fn allocates_a_process_with_the_supplied_provider_parts() {
        let terminated = Arc::new(Mutex::new(0));
        let captured = terminated.clone();
        let written = Arc::new(Mutex::new(Vec::new()));
        let closed = Arc::new(AtomicBool::new(false));
        let process = create_shell_process(
            exit_status(3),
            create_readable_stream(Box::new(ChunkReader {
                chunk: Mutex::new(Some(vec![1])),
            })),
            create_writable_stream(Box::new(RecordingWriter {
                written: written.clone(),
                closed: closed.clone(),
            })),
            empty_readable(),
            Arc::new(move || *captured.lock().unwrap() += 1),
        );
        let status = block_on(process.exit.clone());
        assert_eq!(
            *status.read().unwrap(),
            ShellProcessExitStatus {
                code: Some(3),
                signal: None,
            }
        );
        terminate_shell_process(&process);
        assert_eq!(*terminated.lock().unwrap(), 1);
        let mut stderr = process.stderr;
        let mut out = [0u8; 2];
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stderr)), Ok(1));
        assert_eq!(out[0], 1);
        let mut stdout = process.stdout;
        assert_eq!(block_on(read_readable_stream(&mut out, &mut stdout)), Ok(0));
        let mut stdin = process.stdin;
        assert_eq!(block_on(write_writable_stream(&mut stdin, b"ab")), Ok(2));
        assert_eq!(&*written.lock().unwrap(), b"ab");
        assert!(block_on(close_writable_stream(&mut stdin)).is_ok());
        assert!(closed.load(Ordering::SeqCst));
    }
}

mod initialize_shell_process {
    use super::*;

    #[test]
    fn replaces_every_provider_owned_part() {
        let first_terminated = Arc::new(Mutex::new(0));
        let first_captured = first_terminated.clone();
        let mut process = create_shell_process(
            exit_status(1),
            empty_readable(),
            empty_writable(),
            empty_readable(),
            Arc::new(move || *first_captured.lock().unwrap() += 1),
        );
        let second_terminated = Arc::new(Mutex::new(0));
        let second_captured = second_terminated.clone();
        initialize_shell_process(
            &mut process,
            exit_status(2),
            empty_readable(),
            empty_writable(),
            empty_readable(),
            Arc::new(move || *second_captured.lock().unwrap() += 1),
        );
        let status = block_on(process.exit.clone());
        assert_eq!(
            *status.read().unwrap(),
            ShellProcessExitStatus {
                code: Some(2),
                signal: None,
            }
        );
        terminate_shell_process(&process);
        assert_eq!(*first_terminated.lock().unwrap(), 0);
        assert_eq!(*second_terminated.lock().unwrap(), 1);
    }
}

mod shell_process_exit {
    use super::*;

    #[test]
    fn repeated_await_and_multiple_observers_share_one_result_identity() {
        let polls = Arc::new(AtomicUsize::new(0));
        let status: Ref<ShellProcessExitStatus> = Arc::new(RwLock::new(ShellProcessExitStatus {
            code: Some(5),
            signal: None,
        }));
        let process = create_shell_process(
            create_shared_future(Box::pin(ExitCountdown {
                polls: polls.clone(),
                remaining: 2,
                status: status.clone(),
            })),
            empty_readable(),
            empty_writable(),
            empty_readable(),
            Arc::new(|| {}),
        );
        let first = block_on(process.exit.clone());
        let second = block_on(process.exit.clone());
        assert!(Arc::ptr_eq(&first, &second));
        assert!(Arc::ptr_eq(&first, &status));
        assert_eq!(polls.load(Ordering::SeqCst), 2);
        let third = block_on(process.exit.clone());
        assert!(Arc::ptr_eq(&third, &status));
        assert_eq!(polls.load(Ordering::SeqCst), 2);
        assert_eq!(first.read().unwrap().code, Some(5));
    }
}

mod terminate_shell_process {
    use super::*;

    #[test]
    fn requests_termination_through_the_provider_owned_callback() {
        let terminated = Arc::new(Mutex::new(0));
        let captured = terminated.clone();
        let process = create_shell_process(
            create_shared_future(Box::pin(async {
                Arc::new(RwLock::new(ShellProcessExitStatus {
                    code: None,
                    signal: Some("SIGTERM".to_string()),
                }))
            })),
            empty_readable(),
            empty_writable(),
            empty_readable(),
            Arc::new(move || *captured.lock().unwrap() += 1),
        );
        terminate_shell_process(&process);
        terminate_shell_process(&process);
        assert_eq!(*terminated.lock().unwrap(), 2);
    }
}
