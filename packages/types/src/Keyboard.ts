import type { Entity } from './Entity';
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
export interface SoftKeyboard {
  onShow: Signal<(height: number) => void>;
  onHide: Signal<() => void>;
  onResize: Signal<(height: number) => void>;
}

export type SoftKeyboardVisibilityResult = 'ok' | 'operation-failed';
export const SoftKeyboardVisibilityOkKind = 'ok';
export const SoftKeyboardVisibilityOperationFailedKind = 'operation-failed';

export type SoftKeyboardSetterResult = 'ok' | 'operation-unavailable' | 'operation-failed';
export const SoftKeyboardSetterOkKind = 'ok';
export const SoftKeyboardSetterOperationUnavailableKind = 'operation-unavailable';
export const SoftKeyboardSetterOperationFailedKind = 'operation-failed';

export type SoftKeyboardAttachResult = 'ok' | 'acquisition-failed';
export const SoftKeyboardAttachOkKind = 'ok';
export const SoftKeyboardAttachAcquisitionFailedKind = 'acquisition-failed';

export interface SoftKeyboardInfoBackend extends Entity {
  getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo;
}

export interface SoftKeyboardChangeBackend extends Entity {
  subscribe(listener: () => void): Promise<(() => void) | null>;
}

export interface SoftKeyboardVisibilityBackend extends Entity {
  show(): Promise<SoftKeyboardVisibilityResult>;
  hide(): Promise<SoftKeyboardVisibilityResult>;
}

export interface SoftKeyboardResizeModeWriteBackend extends Entity {
  setResizeMode(mode: SoftKeyboardResizeMode): Promise<SoftKeyboardSetterResult>;
}

export interface SoftKeyboardStyleBackend extends Entity {
  setStyle(style: SoftKeyboardStyleKind): Promise<SoftKeyboardSetterResult>;
}

export interface SoftKeyboardAccessoryBarBackend extends Entity {
  setAccessoryBarVisible(visible: boolean): Promise<SoftKeyboardSetterResult>;
}

export interface SoftKeyboardScrollAssistBackend extends Entity {
  setScrollAssistEnabled(enabled: boolean): Promise<SoftKeyboardSetterResult>;
}
