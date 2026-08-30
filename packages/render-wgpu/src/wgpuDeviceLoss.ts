import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { WgpuDeviceRuntime, WgpuDeviceSignals, WgpuRenderState } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

// Releases the device tier's signal group. The terminal loss FACT survives — a lost device stays
// lost whether or not anyone is listening — so getWgpuDeviceLoss keeps reporting after this call.
export function disposeWgpuDeviceSignals(state: WgpuRenderState): void {
  getWgpuRenderStateRuntime(state).context.signals = null;
}

// Arms loss notification for the device this state draws on. Idempotent, and shared: two states over
// one GPUDevice resolve the same tier and therefore the same group, so a caller cannot accidentally
// create a second one that never fires.
//
// The signal announces the TRANSITION, once. A listener attached after the announcement has already
// been made hears nothing, by design — for that caller the loss is a fact rather than news, and
// getWgpuDeviceLoss is how it reads it. Enabling on an already-lost device is therefore not an error
// and not a missed event; it is simply the wrong question, and the right one has a standing answer.
export function enableWgpuDeviceSignals(state: WgpuRenderState): WgpuDeviceSignals {
  const deviceRuntime = getWgpuRenderStateRuntime(state).context;
  return (deviceRuntime.signals ??= { onDeviceLost: createSignal() });
}

// The device's loss report, or null while it is live. Reports BOTH an unexpected loss and the
// 'destroyed' resolution Flight's own release produces; branch on `reason` to tell them apart.
export function getWgpuDeviceLoss(state: WgpuRenderState): GPUDeviceLostInfo | null {
  return getWgpuRenderStateRuntime(state).context.lost;
}

export function isWgpuDeviceLost(state: WgpuRenderState): boolean {
  return getWgpuRenderStateRuntime(state).context.lost !== null;
}

/**
 * Attaches the one loss observer for a physical device, during device-tier construction and before
 * any render state is published on it.
 *
 * Takes the device RUNTIME, never a state: the handler outlives every state built on this device, so
 * capturing one would pin it — and all of its GPU resources — for the device's whole life.
 *
 * Attaching late is safe and is relied upon. `GPUDevice.lost` resolves once and stays resolved, so a
 * device lost between `requestDevice` and this call still runs the handler. There is no window in
 * which a loss can be missed, which is why no pre-check is needed here.
 *
 * `lost` is absent on hand-built devices in tests and may be absent on a caller-supplied handle from
 * a native host, so its absence reports a live device rather than throwing.
 */
export function observeWgpuDeviceLoss(deviceRuntime: WgpuDeviceRuntime): void {
  const lost = deviceRuntime.device.lost;
  if (lost == null) return;
  void lost.then((info) => {
    // Terminal, so the first report wins; a second resolution could not happen for a real device and
    // must not double-emit if a fake one produces it.
    if (deviceRuntime.lost !== null) return;
    deviceRuntime.lost = info;
    // An orderly `device.destroy()` — which `release` performs on every clean teardown — resolves
    // this same promise with reason 'destroyed'. Announcing it would fire this signal on shutdown,
    // making it useless for the thing it exists to report.
    if (info.reason === 'destroyed') return;
    const signals = deviceRuntime.signals;
    if (signals !== null) emitSignal(signals.onDeviceLost, info);
  });
}
