use flight_entity::{Ref, allocate_entity};
use flight_stream::{ReadableStream, SharedFuture, WritableStream};
use std::sync::Arc;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use flight_stream::{create_readable_stream, create_shared_future, create_writable_stream};
    use std::sync::{Mutex, RwLock};

    fn process(terminate: Arc<dyn Fn() + Send + Sync>) -> ShellProcess {
        return create_shell_process(
            create_shared_future(Box::pin(async {
                Arc::new(RwLock::new(ShellProcessExitStatus {
                    code: Some(0),
                    signal: None,
                }))
            })),
            create_readable_stream(Box::new(futures::io::empty())),
            create_writable_stream(Box::new(futures::io::sink())),
            create_readable_stream(Box::new(futures::io::empty())),
            terminate,
        );
    }

    #[test]
    fn terminate_method_matches_terminate_shell_process() {
        let method_count = Arc::new(Mutex::new(0));
        let captured = method_count.clone();
        let method_process = process(Arc::new(move || *captured.lock().unwrap() += 1));
        let free_count = Arc::new(Mutex::new(0));
        let captured = free_count.clone();
        let free_process = process(Arc::new(move || *captured.lock().unwrap() += 1));
        method_process.terminate();
        terminate_shell_process(&free_process);
        assert_eq!(*method_count.lock().unwrap(), *free_count.lock().unwrap());
        assert_eq!(
            block_on(method_process.exit.clone()).read().unwrap().code,
            block_on(free_process.exit.clone()).read().unwrap().code
        );
    }
}

/// Allocates a process from its provider-owned parts (D12 factory; TS `ShellProcess` is an Entity
/// but the pinned TS package exports no factory).
// flight-lint: allow(conform-extra) D12 entity factory: TS ShellProcess extends Entity but @flighthq/shell exports no factory
pub fn create_shell_process(
    exit: SharedFuture<Ref<ShellProcessExitStatus>>,
    stderr: ReadableStream,
    stdin: WritableStream,
    stdout: ReadableStream,
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
    exit: SharedFuture<Ref<ShellProcessExitStatus>>,
    stderr: ReadableStream,
    stdin: WritableStream,
    stdout: ReadableStream,
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
