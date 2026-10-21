mod ipc;
mod types;

pub mod contract;

// Public lane: the six functions exported by pinned TS `index.ts`, plus the locally owned types
// their signatures use and the HostIpcCapabilities group owned by this package.
pub use contract::invoke_ipc;
pub use contract::on_ipc_invoke;
pub use contract::on_ipc_message;
pub use contract::once_ipc_message;
pub use contract::send_ipc_message;
pub use contract::send_ipc_message_to;

pub use contract::HostIpcCapabilities;
pub use contract::HostIpcHandleCapability;
pub use contract::HostIpcInvokeCapability;
pub use contract::HostIpcMessageCapability;
pub use contract::HostIpcSendCapability;
pub use contract::HostIpcTargetedSendCapability;
pub use contract::IpcArguments;
pub use contract::IpcHandle;
pub use contract::IpcInvoke;
pub use contract::IpcInvokeFuture;
pub use contract::IpcInvokeHandler;
pub use contract::IpcInvokeResult;
pub use contract::IpcMessageListener;
pub use contract::IpcSend;
pub use contract::IpcSubscribe;
pub use contract::IpcTargetNever;
pub use contract::IpcTargetedSend;
pub use contract::IpcUnsubscribe;

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
