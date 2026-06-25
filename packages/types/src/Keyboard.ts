import type { Signal } from './Signal';

// Resize mode controlling how the app viewport reacts when the on-screen keyboard appears.
// Open string contract; built-in values are the SoftKeyboardResize*Kind constants below and a
// native host may register its own vendor-prefixed value.
export type SoftKeyboardResizeMode = string;

// The viewport is not resized when the keyboard appears.
export const SoftKeyboardResizeNoneKind: SoftKeyboardResizeMode = 'None';

// The document body is resized to make room for the keyboard.
export const SoftKeyboardResizeBodyKind: SoftKeyboardResizeMode = 'Body';

// Visual style / appearance of the on-screen keyboard (iOS light/dark appearance).
// Open string contract; built-in values are the SoftKeyboardStyle*Kind constants below.
export type SoftKeyboardStyleKind = string;

// System default keyboard appearance.
export const SoftKeyboardStyleDefaultKind: SoftKeyboardStyleKind = 'Default';

// Dark keyboard appearance.
export const SoftKeyboardStyleDarkKind: SoftKeyboardStyleKind = 'Dark';

// Which edge of a keyboard change a backend is reporting: 'will' fires before the animation begins
// (carrying timing for an app to animate alongside), 'did' fires after it ends.
export type SoftKeyboardPhase = 'will' | 'did';

// Timing snapshot for an in-progress keyboard show/hide/resize, delivered with the 'will' phase.
export interface SoftKeyboardTransition {
  // Animation duration in seconds; 0 on backends that report only the settled 'did' phase.
  durationSeconds: number;
  // Target on-screen keyboard height in CSS pixels after the transition completes.
  height: number;
}

export interface SoftKeyboardInfo {
  visible: boolean;
  // On-screen keyboard height in CSS pixels, or 0 when hidden.
  height: number;
  // Keyboard bounding-rect origin in CSS pixels (0 when hidden).
  x: number;
  y: number;
  // Keyboard bounding-rect width in CSS pixels (0 when hidden).
  width: number;
}

// Event seam for the on-screen (soft) keyboard: a snapshot reader, a change subscription, and
// show/hide controls. The web backend infers keyboard height from visualViewport shrink; a native
// host reports its own keyboard changes through the same subscribe callback. The resize-mode,
// accessory-bar, scroll-assist, and style controls are optional capabilities; the web default omits
// them and the wrapping free functions return sentinels / no-op when absent.
export interface SoftKeyboardBackend {
  getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo;
  // Registers a listener invoked on any keyboard change with the change phase and its timing;
  // returns an unsubscribe function.
  subscribe(listener: (phase: SoftKeyboardPhase, transition: Readonly<SoftKeyboardTransition>) => void): () => void;
  show(): void;
  hide(): void;
  getResizeMode?(): SoftKeyboardResizeMode;
  setResizeMode?(mode: SoftKeyboardResizeMode): void;
  getAccessoryBarVisible?(): boolean;
  setAccessoryBarVisible?(visible: boolean): void;
  getScrollAssistEnabled?(): boolean;
  setScrollAssistEnabled?(enabled: boolean): void;
  setStyle?(style: SoftKeyboardStyleKind): void;
}

// On-screen keyboard event entity. Enable delivery with attachSoftKeyboard; the signals stay inert
// until then. The will-phase signals carry transition timing; the did-phase and simple-path aliases
// carry the settled height (onHide/onDidHide carry nothing).
export interface SoftKeyboard {
  onShow: Signal<(height: number) => void>;
  onHide: Signal<() => void>;
  onResize: Signal<(height: number) => void>;
  onWillShow: Signal<(transition: Readonly<SoftKeyboardTransition>) => void>;
  onWillHide: Signal<(transition: Readonly<SoftKeyboardTransition>) => void>;
  onWillResize: Signal<(transition: Readonly<SoftKeyboardTransition>) => void>;
  onDidShow: Signal<(height: number) => void>;
  onDidHide: Signal<() => void>;
  onDidResize: Signal<(height: number) => void>;
}
