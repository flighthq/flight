// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Device-loss observation and notification (TS `wgpuDeviceLoss.ts`). Loss is a terminal fact of
//! the device tier, shared by every state on the device.

use std::sync::{Arc, Mutex};

use flight_signals::{create_signal, emit_signal};
use flight_stream::SharedFuture;
use futures::FutureExt;
use futures::channel::oneshot;

use flight_host::HostSpawnCapability;

use crate::types::*;

/// Wraps a host-supplied device and queue as the native payload, registering wgpu's lost callback
/// now, before any loss can occur, so the stored loss promise settles exactly once (TS
/// `GPUDevice.lost`, D20, D17). Every clone of the payload shares that promise.
// flight-lint: allow(conform-extra) D17/D20 (Principal cafc5d6b): the payload constructor owns the device's stored loss promise
pub fn create_wgpu_native_device(
    device: wgpu::Device,
    queue: wgpu::Queue,
    host_spawn: HostSpawnCapability,
) -> WgpuNativeDevice {
    let (native, hook) = create_wgpu_native_device_with_loss_hook(device, queue, host_spawn);
    native
        .device
        .set_device_lost_callback(move |reason, message| {
            resolve_wgpu_device_loss(
                &hook,
                WgpuDeviceLostInfo {
                    message,
                    reason: match reason {
                        wgpu::DeviceLostReason::Destroyed => WgpuDeviceLostReason::Destroyed,
                        _ => WgpuDeviceLostReason::Unknown,
                    },
                },
            );
        });
    return native;
}

/// Wraps a device and queue and returns the hook that settles its stored loss promise, for a host
/// that reports loss itself (a web `GPUDevice.lost`) or a test that injects one.
// flight-lint: allow(conform-extra) D17/D20 (Principal cafc5d6b): the payload constructor's loss hook for host- or test-reported loss
pub fn create_wgpu_native_device_with_loss_hook(
    device: wgpu::Device,
    queue: wgpu::Queue,
    host_spawn: HostSpawnCapability,
) -> (WgpuNativeDevice, WgpuDeviceLossHook) {
    let (sender, receiver) = oneshot::channel::<WgpuDeviceLostInfo>();
    let lost = async move {
        // A device dropped without reporting a loss never settles its promise.
        return match receiver.await {
            Ok(info) => info,
            Err(_) => futures::future::pending::<WgpuDeviceLostInfo>().await,
        };
    };
    let hook = WgpuDeviceLossHook {
        inner: Arc::new(Mutex::new(WgpuDeviceLossHookState {
            resolved: None,
            sender: Some(sender),
        })),
    };
    let native = WgpuNativeDevice {
        device,
        queue,
        lost: lost.boxed().shared(),
        host_spawn,
        command_observer: Arc::new(std::sync::RwLock::new(None)),
    };
    return (native, hook);
}

/// Releases the device tier's signal group (TS `disposeWgpuDeviceSignals`). The terminal loss fact
/// survives, so `get_wgpu_device_loss` keeps reporting.
pub fn dispose_wgpu_device_signals(state: &WgpuRenderState) {
    state.runtime.context.write().unwrap().signals = None;
}

/// Arms loss notification for the state's device (TS `enableWgpuDeviceSignals`). Idempotent and
/// shared by every state on the device. The signal announces the transition once; a listener that
/// arrives later reads the fact with `get_wgpu_device_loss`.
pub fn enable_wgpu_device_signals(state: &WgpuRenderState) -> WgpuDeviceSignals {
    let mut device_runtime = state.runtime.context.write().unwrap();
    return device_runtime
        .signals
        .get_or_insert_with(|| WgpuDeviceSignals {
            on_device_lost: create_signal(),
        })
        .clone();
}

/// The device's loss report, or `None` while it is live (TS `getWgpuDeviceLoss`). Reports both an
/// unexpected loss and the `Destroyed` resolution of Flight's own release.
pub fn get_wgpu_device_loss(state: &WgpuRenderState) -> Option<WgpuDeviceLostInfo> {
    return state.runtime.context.read().unwrap().lost.clone();
}

/// The device's stored loss promise (TS `GPUDevice.lost`).
// flight-lint: allow(conform-extra) D17/D20: the native payload's loss promise is the source's GPUDevice.lost member
pub fn get_wgpu_native_device_lost(device: &WgpuNativeDevice) -> SharedFuture<WgpuDeviceLostInfo> {
    return device.lost.clone();
}

/// Whether the state's device is lost (TS `isWgpuDeviceLost`).
pub fn is_wgpu_device_lost(state: &WgpuRenderState) -> bool {
    return state.runtime.context.read().unwrap().lost.is_some();
}

/// Attaches the one loss observer for a device, during device-tier construction (TS
/// `observeWgpuDeviceLoss`, `lost.then(handler)`). The handler is a continuation spawned through the
/// payload's host spawn capability (Principal 2ec2343a): it runs after the current synchronous code,
/// whether the loss already resolved or resolves later, and never inside this call. It holds the
/// device runtime weakly, never a state. The first report wins; an orderly `Destroyed` loss is
/// recorded but never announced.
pub fn observe_wgpu_device_loss(device_runtime: &WgpuDeviceRuntimeRef) {
    let (lost, host_spawn) = {
        let runtime = device_runtime.read().unwrap();
        (
            runtime.native.lost.clone(),
            runtime.native.host_spawn.clone(),
        )
    };
    let weak = Arc::downgrade(device_runtime);
    (host_spawn.spawn)(Box::pin(async move {
        let info = lost.await;
        if let Some(runtime) = weak.upgrade() {
            report_wgpu_device_lost(&runtime, info);
        }
    }));
}

// Records a terminal loss once and announces an unexpected one, after the tier's lock is released.
// The device's own loss callback and a lost presentation surface both arrive here.
pub(crate) fn report_wgpu_device_lost(runtime: &WgpuDeviceRuntimeRef, info: WgpuDeviceLostInfo) {
    let signals = {
        let mut current = runtime.write().unwrap();
        if current.lost.is_some() {
            return;
        }
        current.lost = Some(info.clone());
        if info.reason == WgpuDeviceLostReason::Destroyed {
            return;
        }
        current.signals.clone()
    };
    if let Some(signals) = signals {
        emit_signal(&signals.on_device_lost, &info);
    }
}

/// Settles a device's stored loss promise with the device's own report (TS: the driver resolving
/// `GPUDevice.lost`). The first report wins.
// flight-lint: allow(conform-extra) D17/D20 (Principal cafc5d6b): the construction-time hook that settles the stored loss promise
pub fn resolve_wgpu_device_loss(hook: &WgpuDeviceLossHook, info: WgpuDeviceLostInfo) {
    let sender = {
        let mut state = hook.inner.lock().unwrap();
        if state.resolved.is_some() {
            return;
        }
        state.resolved = Some(info.clone());
        state.sender.take()
    };
    if let Some(sender) = sender {
        let _ = sender.send(info);
    }
}
