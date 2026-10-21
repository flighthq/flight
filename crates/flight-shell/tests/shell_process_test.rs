use std::sync::{Arc, Mutex};

use flight_entity::Uint8Array;
use flight_shell::*;

use crate::block_on;

mod create_shell_process {
    use super::*;

    #[test]
    fn allocates_a_process_with_the_supplied_provider_parts() {
        let terminated = Arc::new(Mutex::new(0));
        let captured = terminated.clone();
        let mut process = create_shell_process(
            Box::pin(async {
                ShellProcessExitStatus {
                    code: Some(3),
                    signal: None,
                }
            }),
            readable(&[1]),
            writable(),
            readable(&[2]),
            Arc::new(move || *captured.lock().unwrap() += 1),
        );
        assert_eq!(
            block_on(&mut process.exit),
            ShellProcessExitStatus {
                code: Some(3),
                signal: None,
            }
        );
        assert_eq!(
            block_on((process.stderr.read)()).map(|chunk| chunk.to_vec()),
            Some(vec![1])
        );
        assert_eq!(
            block_on((process.stdout.read)()).map(|chunk| chunk.to_vec()),
            Some(vec![2])
        );
        terminate_shell_process(&process);
        assert_eq!(*terminated.lock().unwrap(), 1);
    }

    fn readable(chunks: &'static [u8]) -> ShellReadableStream {
        let remaining = Arc::new(Mutex::new(Some(chunks.to_vec())));
        return ShellReadableStream {
            read: Arc::new(move || {
                let next = remaining.lock().unwrap().take();
                let future: ShellReadChunkFuture = Box::pin(async move {
                    return next.map(|chunk| chunk.into_boxed_slice());
                });
                return future;
            }),
        };
    }

    fn writable() -> ShellWritableStream {
        return ShellWritableStream {
            write: Arc::new(|_chunk: Box<Uint8Array>| -> ShellWriteFuture { Box::pin(async {}) }),
            close: Arc::new(|| -> ShellWriteFuture { Box::pin(async {}) }),
        };
    }
}

mod initialize_shell_process {
    use super::*;

    #[test]
    fn replaces_every_provider_owned_part() {
        let first_terminated = Arc::new(Mutex::new(0));
        let first_captured = first_terminated.clone();
        let mut process = create_shell_process(
            Box::pin(async {
                ShellProcessExitStatus {
                    code: Some(1),
                    signal: None,
                }
            }),
            readable(),
            writable(),
            readable(),
            Arc::new(move || *first_captured.lock().unwrap() += 1),
        );
        let second_terminated = Arc::new(Mutex::new(0));
        let second_captured = second_terminated.clone();
        initialize_shell_process(
            &mut process,
            Box::pin(async {
                ShellProcessExitStatus {
                    code: Some(2),
                    signal: None,
                }
            }),
            readable(),
            writable(),
            readable(),
            Arc::new(move || *second_captured.lock().unwrap() += 1),
        );
        assert_eq!(
            block_on(&mut process.exit),
            ShellProcessExitStatus {
                code: Some(2),
                signal: None,
            }
        );
        terminate_shell_process(&process);
        assert_eq!(*first_terminated.lock().unwrap(), 0);
        assert_eq!(*second_terminated.lock().unwrap(), 1);
    }

    fn readable() -> ShellReadableStream {
        return ShellReadableStream {
            read: Arc::new(|| -> ShellReadChunkFuture { Box::pin(async { None }) }),
        };
    }

    fn writable() -> ShellWritableStream {
        return ShellWritableStream {
            write: Arc::new(|_chunk: Box<Uint8Array>| -> ShellWriteFuture { Box::pin(async {}) }),
            close: Arc::new(|| -> ShellWriteFuture { Box::pin(async {}) }),
        };
    }
}

mod terminate_shell_process {
    use super::*;

    #[test]
    fn requests_termination_through_the_provider_owned_callback() {
        let terminated = Arc::new(Mutex::new(0));
        let captured = terminated.clone();
        let process = create_shell_process(
            Box::pin(async {
                ShellProcessExitStatus {
                    code: None,
                    signal: Some("SIGTERM".to_string()),
                }
            }),
            readable(),
            writable(),
            readable(),
            Arc::new(move || *captured.lock().unwrap() += 1),
        );
        terminate_shell_process(&process);
        terminate_shell_process(&process);
        assert_eq!(*terminated.lock().unwrap(), 2);
    }

    fn readable() -> ShellReadableStream {
        return ShellReadableStream {
            read: Arc::new(|| -> ShellReadChunkFuture { Box::pin(async { None }) }),
        };
    }

    fn writable() -> ShellWritableStream {
        return ShellWritableStream {
            write: Arc::new(|_chunk: Box<Uint8Array>| -> ShellWriteFuture { Box::pin(async {}) }),
            close: Arc::new(|| -> ShellWriteFuture { Box::pin(async {}) }),
        };
    }
}
