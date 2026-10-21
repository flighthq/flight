use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{AnySlot, Entity, EntityRuntimeSlot, FlightError, allocate_entity};

/// The source's `readonly unknown[]`, owned at a send/invoke boundary.
pub type IpcArguments = Vec<AnySlot>;

/// A release callback belonging to exactly one registration.
pub type IpcUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// A stored invoke handler. The source permits an immediate value or a Promise; the IR normalizes
/// both arms to the D15 boxed-future form and retains Promise rejection in `IpcInvokeResult`.
pub type IpcInvokeHandler = Arc<dyn Fn(&[AnySlot]) -> IpcInvokeFuture + Send + Sync>;

/// A stored message listener. The borrowed slice is the Rust representation of spreading the
/// source's `readonly unknown[]` into rest arguments without cloning erased payload values.
pub type IpcMessageListener = Arc<dyn Fn(&[AnySlot]) + Send + Sync>;

/// A provider callback that registers one invoke handler.
pub type IpcHandle = Arc<dyn Fn(String, IpcInvokeHandler) -> IpcUnsubscribe + Send + Sync>;

/// A provider callback that starts one asynchronous request.
pub type IpcInvoke = Arc<dyn Fn(String, IpcArguments) -> IpcInvokeFuture + Send + Sync>;

/// A provider callback that subscribes one message listener.
pub type IpcSubscribe = Arc<dyn Fn(String, IpcMessageListener) -> IpcUnsubscribe + Send + Sync>;

/// A provider callback that sends a message without a target.
pub type IpcSend = Arc<dyn Fn(&str, IpcArguments) + Send + Sync>;

/// A provider callback that sends to a caller-supplied target. The target stays borrowed and is
/// forwarded unchanged, preserving its identity without an owned clone.
pub type IpcTargetedSend<Target> = Arc<dyn Fn(&Target, &str, IpcArguments) + Send + Sync>;

/// A resolved IPC reply or the error carried by a rejected Promise.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm in Rust
pub type IpcInvokeResult = Result<AnySlot, FlightError>;

/// Boxed, Send future used by invoke providers and registered handlers (D15).
pub type IpcInvokeFuture = Pin<Box<dyn Future<Output = IpcInvokeResult> + Send>>;

/// Rust's uninhabited spelling of the source default `Target = never`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IpcTargetNever {}

/// Operation-tight capability for registering invoke handlers.
#[derive(Clone)]
pub struct HostIpcHandleCapability {
    pub handle: IpcHandle,
}

/// Operation-tight capability for asynchronous invoke requests.
#[derive(Clone)]
pub struct HostIpcInvokeCapability {
    pub invoke: IpcInvoke,
}

/// Operation-tight capability for message subscriptions.
#[derive(Clone)]
pub struct HostIpcMessageCapability {
    pub subscribe: IpcSubscribe,
}

/// Operation-tight capability for untargeted sends.
#[derive(Clone)]
pub struct HostIpcSendCapability {
    pub send: IpcSend,
}

/// Operation-tight targeted send capability. This source interface directly extends `Entity`, so
/// it carries the private runtime slot even though the other callback capabilities are plain data.
pub struct HostIpcTargetedSendCapability<Target = IpcTargetNever> {
    runtime: EntityRuntimeSlot,
    pub send: IpcTargetedSend<Target>,
}

/// The optional IPC capability group owned by this package (TS `HostIpcCapabilities`).
#[derive(Clone)]
pub struct HostIpcCapabilities<Target = IpcTargetNever> {
    pub handle: Option<HostIpcHandleCapability>,
    pub invoke: Option<HostIpcInvokeCapability>,
    pub message: Option<HostIpcMessageCapability>,
    pub send: Option<HostIpcSendCapability>,
    pub targeted_send: Option<HostIpcTargetedSendCapability<Target>>,
}

// flight-lint: allow(conform-extra) D12: Rust needs a constructor because the Entity runtime slot is private; TS host adapters populate the structural interface
pub fn create_host_ipc_targeted_send_capability<Target>(
    send: IpcTargetedSend<Target>,
) -> HostIpcTargetedSendCapability<Target> {
    let mut out: HostIpcTargetedSendCapability<Target> = allocate_entity();
    initialize_host_ipc_targeted_send_capability(&mut out, send);
    return out;
}

// flight-lint: allow(conform-extra) D12: construction helper for the private Entity runtime slot
pub fn initialize_host_ipc_targeted_send_capability<Target>(
    out: &mut HostIpcTargetedSendCapability<Target>,
    send: IpcTargetedSend<Target>,
) {
    out.send = send;
}

impl<Target> Clone for HostIpcTargetedSendCapability<Target> {
    fn clone(&self) -> Self {
        return Self {
            runtime: self.runtime.clone(),
            send: self.send.clone(),
        };
    }
}

impl<Target> fmt::Debug for HostIpcTargetedSendCapability<Target> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("HostIpcTargetedSendCapability")
            .field("runtime", &self.runtime)
            .field("send", &"IpcTargetedSend(..)")
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: every slot empty for any target, including the uninhabited default, which a derive would wrongly require to implement Default
impl<Target> Default for HostIpcCapabilities<Target> {
    fn default() -> Self {
        return Self {
            handle: None,
            invoke: None,
            message: None,
            send: None,
            targeted_send: None,
        };
    }
}

impl<Target> Default for HostIpcTargetedSendCapability<Target> {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            send: Arc::new(|_target: &Target, _channel: &str, _args: IpcArguments| {}),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: callback identity is the capability's value equality and the Entity runtime is ignored (D12)
impl<Target> PartialEq for HostIpcTargetedSendCapability<Target> {
    fn eq(&self, other: &Self) -> bool {
        return Arc::ptr_eq(&self.send, &other.send);
    }
}

// flight-lint: allow(sugar-delegates) D12 generic Entity trait boilerplate exposes the private runtime slot and is not sugar
impl<Target> Entity for HostIpcTargetedSendCapability<Target> {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return &self.runtime;
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return &mut self.runtime;
    }
}
