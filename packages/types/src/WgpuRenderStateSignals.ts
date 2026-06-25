import type { Signal } from './Signal';
export interface WgpuRenderStateSignals {
  readonly onDeviceLost: Signal<(info: GPUDeviceLostInfo) => void>;
  readonly onContextResize: Signal<(width: number, height: number) => void>;
}
