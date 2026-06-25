import type { Signal } from './Signal';
import type { WebcamDevice } from './WebcamDevice';
import type { WebcamPermissionState } from './WebcamPermissionState';
export interface WebcamSignals {
  onWebcamDeviceChange: Signal<(devices: readonly Readonly<WebcamDevice>[]) => void>;
  onWebcamPermissionChange: Signal<(state: WebcamPermissionState) => void>;
  onWebcamStreamEnded: Signal<(streamId: string) => void>;
}
