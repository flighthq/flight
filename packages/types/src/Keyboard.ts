/** @deprecated Import keyboard contracts from `@flighthq/keyboard/contract`. The runtime kind values stay
 * duplicated here because @flighthq/types may re-export owner contracts only as types. */
export const SoftKeyboardResizeNoneKind = 'None';
export const SoftKeyboardResizeBodyKind = 'Body';
export const SoftKeyboardStyleDefaultKind = 'Default';
export const SoftKeyboardStyleDarkKind = 'Dark';
export const SoftKeyboardVisibilityOkKind = 'ok';
export const SoftKeyboardVisibilityOperationFailedKind = 'operation-failed';
export const SoftKeyboardSetterOkKind = 'ok';
export const SoftKeyboardSetterOperationUnavailableKind = 'operation-unavailable';
export const SoftKeyboardSetterOperationFailedKind = 'operation-failed';
export const SoftKeyboardAttachOkKind = 'ok';
export const SoftKeyboardAttachAcquisitionFailedKind = 'acquisition-failed';

export type {
  SoftKeyboardResizeMode,
  SoftKeyboardStyleKind,
  SoftKeyboardInfo,
  SoftKeyboard,
  SoftKeyboardVisibilityResult,
  SoftKeyboardSetterResult,
  SoftKeyboardAttachResult,
  HostSoftKeyboardInfoCapability,
  SoftKeyboardChangeSubscription,
  HostSoftKeyboardChangeCapability,
  HostSoftKeyboardVisibilityCapability,
  HostSoftKeyboardResizeModeWriteCapability,
  HostSoftKeyboardStyleCapability,
  HostSoftKeyboardAccessoryBarCapability,
  HostSoftKeyboardScrollAssistCapability,
} from '@flighthq/keyboard/contract';
