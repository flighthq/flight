use flight_entity::allocate_entity;
use std::sync::Arc;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use flight_entity::Uint8Array;
    use std::sync::Mutex;

    #[test]
    fn terminate_method_matches_terminate_shell_process() {
        let method_count = Arc::new(Mutex::new(0));
        let captured = method_count.clone();
        let method_process = create_shell_process(
            Box::pin(async {
                ShellProcessExitStatus {
                    code: Some(0),
                    signal: None,
                }
            }),
            ShellReadableStream {
                read: Arc::new(|| -> ShellReadChunkFuture { Box::pin(async { None }) }),
            },
            ShellWritableStream {
                write: Arc::new(|_chunk: Box<Uint8Array>| -> ShellWriteFuture {
                    Box::pin(async {})
                }),
                close: Arc::new(|| -> ShellWriteFuture { Box::pin(async {}) }),
            },
            ShellReadableStream {
                read: Arc::new(|| -> ShellReadChunkFuture { Box::pin(async { None }) }),
            },
            Arc::new(move || *captured.lock().unwrap() += 1),
        );
        let free_count = Arc::new(Mutex::new(0));
        let captured = free_count.clone();
        let free_process = create_shell_process(
            Box::pin(async {
                ShellProcessExitStatus {
                    code: Some(0),
                    signal: None,
                }
            }),
            ShellReadableStream {
                read: Arc::new(|| -> ShellReadChunkFuture { Box::pin(async { None }) }),
            },
            ShellWritableStream {
                write: Arc::new(|_chunk: Box<Uint8Array>| -> ShellWriteFuture {
                    Box::pin(async {})
                }),
                close: Arc::new(|| -> ShellWriteFuture { Box::pin(async {}) }),
            },
            ShellReadableStream {
                read: Arc::new(|| -> ShellReadChunkFuture { Box::pin(async { None }) }),
            },
            Arc::new(move || *captured.lock().unwrap() += 1),
        );
        method_process.terminate();
        terminate_shell_process(&free_process);
        assert_eq!(*method_count.lock().unwrap(), *free_count.lock().unwrap());
        assert_eq!(block_on(method_process.exit), block_on(free_process.exit));
    }
}

/// Allocates a process from its provider-owned parts (D12 factory; TS `ShellProcess` is an Entity
/// but the pinned TS package exports no factory).
// flight-lint: allow(conform-extra) D12 entity factory: TS ShellProcess extends Entity but @flighthq/shell exports no factory
pub fn create_shell_process(
    exit: ShellProcessExitFuture,
    stderr: ShellReadableStream,
    stdin: ShellWritableStream,
    stdout: ShellReadableStream,
    terminate: Arc<dyn Fn() + Send + Sync>,
) -> ShellProcess {
    let mut out: ShellProcess = allocate_entity();
    initialize_shell_process(&mut out, exit, stderr, stdin, stdout, terminate);
    return out;
}

/// Replaces every provider-owned part of an existing process under construction (D12).
// flight-lint: allow(conform-extra) D12 entity factory: TS ShellProcess extends Entity but @flighthq/shell exports no factory
pub fn initialize_shell_process(
    out: &mut ShellProcess,
    exit: ShellProcessExitFuture,
    stderr: ShellReadableStream,
    stdin: ShellWritableStream,
    stdout: ShellReadableStream,
    terminate: Arc<dyn Fn() + Send + Sync>,
) {
    out.exit = exit;
    out.stderr = stderr;
    out.stdin = stdin;
    out.stdout = stdout;
    out.terminate = terminate;
}

/// Requests termination of a live process (TS `ShellProcess.terminate`).
// flight-lint: allow(conform-extra) D12/D9: TS ShellProcess.terminate is an interface member; @flighthq/shell exports no free function for it
pub fn terminate_shell_process(process: &ShellProcess) {
    (process.terminate)();
}

// ============================================================================
// D18 sugar: the process method delegates to the free function
// ============================================================================

impl ShellProcess {
    pub fn terminate(&self) {
        return terminate_shell_process(self);
    }
}
