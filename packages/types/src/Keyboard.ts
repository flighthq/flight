import type { Signal } from './Signal';
export type SoftKeyboardResizeMode = string;
export const SoftKeyboardResizeNoneKind = 'None';
export const SoftKeyboardResizeBodyKind = 'Body';
export type SoftKeyboardStyleKind = string;
export const SoftKeyboardStyleDefaultKind = 'Default';
export const SoftKeyboardStyleDarkKind = 'Dark';
export interface SoftKeyboardInfo {
  visible: boolean;
  height: number;
  x: number;
  y: number;
  width: number;
}

// `ok` means the provider accepted/completed the API call, not that OS policy visibly changed.
export interface SoftKeyboardBackend {
  getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo;
  subscribe(listener: () => void): Promise<(() => void) | null>;
  show(): Promise<boolean>;
  hide(): Promise<boolean>;
  setResizeMode?(mode: SoftKeyboardResizeMode): Promise<boolean>;
  setAccessoryBarVisible?(visible: boolean): Promise<boolean>;
  setScrollAssistEnabled?(enabled: boolean): Promise<boolean>;
  setStyle?(style: SoftKeyboardStyleKind): Promise<boolean>;
}
export interface SoftKeyboard {
  onShow: Signal<(height: number) => void>;
  onHide: Signal<() => void>;
  onResize: Signal<(height: number) => void>;
}

export type SoftKeyboardOperation = keyof SoftKeyboardBackend;
