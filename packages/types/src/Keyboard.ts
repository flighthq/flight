import type { Signal } from './Signal';

export interface SoftKeyboardInfo {
  visible: boolean;
  // On-screen keyboard height in CSS pixels, or 0 when hidden.
  height: number;
}

// Event seam for the on-screen (soft) keyboard: a snapshot reader, a change subscription, and
// show/hide controls. The web backend infers keyboard height from visualViewport shrink; a native
// host reports its own keyboard changes through the same subscribe callback.
export interface SoftKeyboardBackend {
  getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo;
  // Registers a listener invoked on any keyboard change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
  show(): void;
  hide(): void;
}

// On-screen keyboard event entity. Enable delivery with attachSoftKeyboard; the signals stay inert
// until then.
export interface SoftKeyboard {
  onShow: Signal<(height: number) => void>;
  onHide: Signal<() => void>;
  onResize: Signal<(height: number) => void>;
}
