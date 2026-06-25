import type { Signal } from './Signal';
export type SoftKeyboardResizeMode = string;
export const SoftKeyboardResizeNoneKind = 'None';
export const SoftKeyboardResizeBodyKind = 'Body';
export type SoftKeyboardStyleKind = string;
export const SoftKeyboardStyleDefaultKind = 'Default';
export const SoftKeyboardStyleDarkKind = 'Dark';
export type SoftKeyboardPhase = 'will' | 'did';
export interface SoftKeyboardTransition {
  durationSeconds: number;
  height: number;
}
export interface SoftKeyboardInfo {
  visible: boolean;
  height: number;
  x: number;
  y: number;
  width: number;
}
export interface SoftKeyboardBackend {
  getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo;
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
