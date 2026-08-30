import type { Signal } from './Signal';

// Loss notification for one physical GPUDevice, armed by enableWgpuDeviceSignals. The group lives on
// the device tier, not on a render state, because a device is shared by every state derived from it
// and its loss is a property of the device rather than of any one consumer.
//
// onDeviceLost emits at most once, and only for an UNEXPECTED loss. A device whose `lost` promise
// resolves because Flight itself called `device.destroy()` reports reason 'destroyed'; that is an
// orderly teardown, so it is recorded as the terminal fact but never announced here. Read the fact
// with getWgpuDeviceLoss, which reports both kinds.
export interface WgpuDeviceSignals {
  onDeviceLost: Signal<(info: GPUDeviceLostInfo) => void>;
}
