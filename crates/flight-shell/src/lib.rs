mod shell;
mod shell_process;
mod types;

pub mod contract;

// Public lane: the ten functions exported by pinned TS `index.ts`, plus the locally owned types
// their signatures use. Factories, string helpers and union accessors stay contract-only.
pub use contract::create_shell_process;
pub use contract::initialize_shell_process;
pub use contract::is_shell_url_allowed;
pub use contract::move_shell_item_to_trash;
pub use contract::move_shell_items_to_trash;
pub use contract::open_shell_external_url;
pub use contract::open_shell_path;
pub use contract::read_shell_shortcut_link;
pub use contract::reveal_shell_path;
pub use contract::shell_beep;
pub use contract::spawn_shell_process;
pub use contract::terminate_shell_process;
pub use contract::write_shell_shortcut_link;

pub use contract::HostShellBeepCapability;
pub use contract::HostShellCapabilities;
pub use contract::HostShellExternalCapability;
pub use contract::HostShellPathOpenCapability;
pub use contract::HostShellPathRevealCapability;
pub use contract::HostShellProcessCapability;
pub use contract::HostShellShortcutLinkCapability;
pub use contract::HostShellTrashCapability;

pub use contract::ShellExternalFuture;
pub use contract::ShellExternalOutcome;
pub use contract::ShellExternalReason;
pub use contract::ShellExternalUrlPolicy;
pub use contract::ShellPathOpenFuture;
pub use contract::ShellPathOpenOutcome;
pub use contract::ShellPathOpenOutcomeOk;
pub use contract::ShellPathOpenOutcomeOperationFailed;
pub use contract::ShellPathOpenReason;
pub use contract::ShellPathRevealFuture;
pub use contract::ShellPathRevealOutcome;
pub use contract::ShellPathRevealReason;
pub use contract::ShellProcess;
pub use contract::ShellProcessExitStatus;
pub use contract::ShellProcessOptions;
pub use contract::ShellShortcutLink;
pub use contract::ShellShortcutLinkReadFuture;
pub use contract::ShellShortcutLinkReadOutcome;
pub use contract::ShellShortcutLinkReadOutcomeOk;
pub use contract::ShellShortcutLinkReadOutcomeOperationFailed;
pub use contract::ShellShortcutLinkReadReason;
pub use contract::ShellShortcutLinkWriteFuture;
pub use contract::ShellShortcutLinkWriteOutcome;
pub use contract::ShellShortcutLinkWriteReason;
pub use contract::ShellShortcutWriteOperation;
pub use contract::ShellTrashFuture;
pub use contract::ShellTrashOutcome;
pub use contract::ShellTrashReason;

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
