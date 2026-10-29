// Generated from crates/flight-input/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityRaw } from '@flighthq/entity/contract';
import type { InputIngressSource, ProviderRef } from '@flighthq/host/contract';
import type { SignalRaw } from '@flighthq/signals/contract';

import type { InputManagerRuntime } from './inputBinding.ts';

/**
 * The gamepad axis semantic name (TS `GamepadAxisKind`), a closed string union.
 */
export const GamepadAxisKind = {
  StickLeftX: 'StickLeftX',
  StickLeftY: 'StickLeftY',
  StickRightX: 'StickRightX',
  StickRightY: 'StickRightY',
} as const;
export type GamepadAxisKind = (typeof GamepadAxisKind)[keyof typeof GamepadAxisKind];

/**
 * The gamepad button semantic name (TS `GamepadButtonKind`), a closed string union.
 */
export const GamepadButtonKind = {
  ButtonEast: 'ButtonEast',
  ButtonNorth: 'ButtonNorth',
  ButtonSouth: 'ButtonSouth',
  ButtonWest: 'ButtonWest',
  DpadDown: 'DpadDown',
  DpadLeft: 'DpadLeft',
  DpadRight: 'DpadRight',
  DpadUp: 'DpadUp',
  Home: 'Home',
  Select: 'Select',
  ShoulderLeft: 'ShoulderLeft',
  ShoulderRight: 'ShoulderRight',
  Start: 'Start',
  StickLeft: 'StickLeft',
  StickRight: 'StickRight',
  Touchpad: 'Touchpad',
  TriggerLeft: 'TriggerLeft',
  TriggerRight: 'TriggerRight',
} as const;
export type GamepadButtonKind = (typeof GamepadButtonKind)[keyof typeof GamepadButtonKind];

/**
 * The gamepad layout convention (TS `GamepadMapping`). `Unspecified` is the source's empty
 * string.
 */
export const GamepadMapping = {
  Standard: 'standard',
  Raw: 'raw',
  Unspecified: '',
} as const;
export type GamepadMapping = (typeof GamepadMapping)[keyof typeof GamepadMapping];

/**
 * How a wheel delta is expressed (TS `MouseWheelMode`).
 */
export type MouseWheelMode = 'lines' | 'pages' | 'pixels' | 'unknown';

/**
 * The pointer device family (TS `PointerType`).
 */
export type PointerType = 'mouse' | 'pen' | 'touch' | 'unknown';

/**
 * The reason arm of a pointer-lock exit outcome (TS `InputPointerLockExitOutcome['reason']`).
 */
export type InputPointerLockExitReason = 'ok' | 'api-unavailable' | 'operation-failed';

/**
 * The reason arm of a pointer-lock request outcome (TS `InputPointerLockRequestOutcome['reason']`).
 */
export type InputPointerLockRequestReason =
  | 'ok'
  | 'api-unavailable'
  | 'denied'
  | 'operation-failed'
  | 'target-not-found';

/**
 * One subscription release callback (TS `() => void`).
 */
export type InputIngressRelease = () => void;

/**
 * One disposer returned by connecting a state to a manager (TS `() => void`).
 */
export type InputDisposer = () => void;

/**
 * One key-repeat tick callback.
 */
export type InputRepeatCallback = () => void;

/**
 * Boxed Send future for a pointer-lock exit command (D15).
 */
export type InputPointerLockExitFuture = Promise<InputPointerLockExitOutcome>;

/**
 * Boxed Send future for a pointer-lock request command (D15).
 */
export type InputPointerLockRequestFuture = Promise<InputPointerLockRequestOutcome>;

/**
 * One attachment method of the input ingress provider (TS `HostInputIngressCapability` member).
 */
export type InputIngressAttach = (
  arg0: Readonly<InputIngressSource>,
  arg1: InputIngressSink,
  arg2?: Readonly<AttachInputOptions>,
) => InputIngressRelease;

/**
 * One normalized gamepad axis event (TS `InputGamepadAxisData`).
 */
export interface InputGamepadAxisData {
  axis: number;
  gamepad: number;
  timeStamp: number;
  value: number;
}

/**
 * One normalized gamepad button event (TS `InputGamepadButtonData`).
 */
export interface InputGamepadButtonData {
  button: number;
  gamepad: number;
  timeStamp: number;
  value: number;
}

/**
 * One gamepad connect/disconnect event (TS `InputGamepadConnectData`).
 */
export interface InputGamepadConnectData {
  gamepad: number;
  id: string;
  mapping: GamepadMapping;
}

/**
 * One normalized keyboard event (TS `InputKeyboardData`).
 */
export interface InputKeyboardData {
  altKey: boolean;
  capsLock: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  keyCode: number;
  location: number;
  metaKey: boolean;
  modifier: number;
  numLock: boolean;
  repeat: boolean;
  shiftKey: boolean;
  timeStamp: number;
}

/**
 * One normalized pointer/wheel event (TS `InputPointerData`).
 */
export interface InputPointerData {
  altKey: boolean;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  deltaX: number;
  deltaY: number;
  height: number;
  isPrimary: boolean;
  metaKey: boolean;
  pointerId: number;
  pointerType: PointerType;
  pressure: number;
  shiftKey: boolean;
  tiltX: number;
  tiltY: number;
  timeStamp: number;
  twist: number;
  wheelMode: MouseWheelMode;
  width: number;
  x: number;
  y: number;
}

/**
 * One normalized text event (TS `InputTextData`).
 */
export interface InputTextData {
  isComposing: boolean;
  text: string;
}

/**
 * Per-attachment ingress options (TS `AttachInputOptions`).
 */
export interface AttachInputOptions {
  preventDefault?: boolean;
}

/**
 * Key-repeat timing options (TS `InputKeyRepeatOptions`), in milliseconds.
 */
export interface InputKeyRepeatOptions {
  delay: number;
  interval: number;
}

/**
 * The caller-owned output of a radial stick dead zone (TS out object `{ x, y }`).
 */
export interface GamepadStickOutput {
  x: number;
  y: number;
}

/**
 * The pointer-lock exit outcome (TS `InputPointerLockExitOutcome`).
 */
export interface InputPointerLockExitOutcome {
  reason: InputPointerLockExitReason;
}

/**
 * The pointer-lock request outcome (TS `InputPointerLockRequestOutcome`).
 */
export interface InputPointerLockRequestOutcome {
  reason: InputPointerLockRequestReason;
}

/**
 * Synchronous borrowed normalized-event delivery owned by one manager attachment (TS
 * `InputIngressSink`). Every field is a stored callback (D9d).
 */
export interface InputIngressSink {
  gamepadAxisMove: (arg0: Readonly<InputGamepadAxisData>) => void;
  gamepadButtonDown: (arg0: Readonly<InputGamepadButtonData>) => void;
  gamepadButtonUp: (arg0: Readonly<InputGamepadButtonData>) => void;
  gamepadConnect: (arg0: Readonly<InputGamepadConnectData>) => void;
  gamepadDisconnect: (arg0: Readonly<InputGamepadConnectData>) => void;
  isEnabled: () => boolean;
  keyDown: (arg0: Readonly<InputKeyboardData>) => void;
  keyUp: (arg0: Readonly<InputKeyboardData>) => void;
  pointerCancel: (arg0: Readonly<InputPointerData>) => void;
  pointerDown: (arg0: Readonly<InputPointerData>) => void;
  pointerMove: (arg0: Readonly<InputPointerData>) => void;
  pointerMoveRelative: (arg0: Readonly<InputPointerData>) => void;
  pointerUp: (arg0: Readonly<InputPointerData>) => void;
  textEdit: (arg0: Readonly<InputTextData>) => void;
  textInput: (arg0: Readonly<InputTextData>) => void;
  wheel: (arg0: Readonly<InputPointerData>) => void;
}

/**
 * The process-wide input ingress provider (TS `HostInputIngressCapability`).
 */
export interface HostInputIngressCapability {
  provider: ProviderRef;
  attachGamepad: InputIngressAttach;
  attachKeyboard: InputIngressAttach;
  attachPointer: InputIngressAttach;
  attachRelativePointer: InputIngressAttach;
  attachText: InputIngressAttach;
  attachWheel: InputIngressAttach;
}

/**
 * One-time host preparation of an input target (TS `HostInputTargetCapability`).
 */
export interface HostInputTargetCapability {
  provider: ProviderRef;
  prepare: (arg0: Readonly<InputTargetHandleRaw>) => void;
}

/**
 * Host file-drop events (TS `HostInputDropFileCapability`).
 */
export interface HostInputDropFileCapability {
  provider: ProviderRef;
  subscribe: (arg0: Readonly<InputTargetHandleRaw>, arg1: (arg0: string) => void) => InputIngressRelease;
}

/**
 * Host target focus/blur events (TS `HostInputFocusCapability`).
 */
export interface HostInputFocusCapability {
  provider: ProviderRef;
  subscribe: (arg0: Readonly<InputTargetHandleRaw>, arg1: () => void, arg2: () => void) => InputIngressRelease;
}

/**
 * Pointer-lock commands (TS `HostInputPointerLockCapability`).
 */
export interface HostInputPointerLockCapability {
  provider: ProviderRef;
  exit: () => InputPointerLockExitFuture;
  request: (arg0: Readonly<InputTargetHandleRaw>) => InputPointerLockRequestFuture;
}

/**
 * The input capability group (TS `HostInputCapabilities`). An omitted slot is capability absence.
 */
export interface HostInputCapabilities {
  dropFile?: HostInputDropFileCapability;
  focus?: HostInputFocusCapability;
  ingress?: HostInputIngressCapability;
  pointerLock?: HostInputPointerLockCapability;
  target?: HostInputTargetCapability;
}

/**
 * Provider-bound input target identity (TS `InputTargetHandle`, an Entity). The TS `__brand`
 * literal is carried by the Rust nominal type instead of a field.
 */
export interface InputTargetHandleRaw extends EntityRaw {}

/**
 * The manager event group (TS `InputSignals`, an Entity).
 */
export interface InputSignalsRaw extends EntityRaw {
  onGamepadAxisMove: SignalRaw<InputGamepadAxisData>;
  onGamepadButtonDown: SignalRaw<InputGamepadButtonData>;
  onGamepadButtonUp: SignalRaw<InputGamepadButtonData>;
  onGamepadConnect: SignalRaw<InputGamepadConnectData>;
  onGamepadDisconnect: SignalRaw<InputGamepadConnectData>;
  onKeyDown: SignalRaw<InputKeyboardData>;
  onKeyUp: SignalRaw<InputKeyboardData>;
  onPointerCancel: SignalRaw<InputPointerData>;
  onPointerDown: SignalRaw<InputPointerData>;
  onPointerMove: SignalRaw<InputPointerData>;
  onPointerMoveRelative: SignalRaw<InputPointerData>;
  onPointerUp: SignalRaw<InputPointerData>;
  onTextEdit: SignalRaw<InputTextData>;
  onTextInput: SignalRaw<InputTextData>;
  onWheel: SignalRaw<InputPointerData>;
}

/**
 * The input manager (TS `InputManager`, an Entity extending its signals). `enabled` gates every
 * emission delivered through an attached ingress sink.
 */
export interface InputManagerRaw extends EntityRaw {
  enabled: boolean;
  onGamepadAxisMove: SignalRaw<InputGamepadAxisData>;
  onGamepadButtonDown: SignalRaw<InputGamepadButtonData>;
  onGamepadButtonUp: SignalRaw<InputGamepadButtonData>;
  onGamepadConnect: SignalRaw<InputGamepadConnectData>;
  onGamepadDisconnect: SignalRaw<InputGamepadConnectData>;
  onKeyDown: SignalRaw<InputKeyboardData>;
  onKeyUp: SignalRaw<InputKeyboardData>;
  onPointerCancel: SignalRaw<InputPointerData>;
  onPointerDown: SignalRaw<InputPointerData>;
  onPointerMove: SignalRaw<InputPointerData>;
  onPointerMoveRelative: SignalRaw<InputPointerData>;
  onPointerUp: SignalRaw<InputPointerData>;
  onTextEdit: SignalRaw<InputTextData>;
  onTextInput: SignalRaw<InputTextData>;
  onWheel: SignalRaw<InputPointerData>;
}

/**
 * The held-state snapshot and per-frame edge sets (TS `InputState`, an Entity). Maps are
 * lookup-only (D3); the sets are membership-only. Gamepad keys are encoded as
 * `gamepad * MAX_GAMEPAD_BUTTONS + button` (buttons) and `gamepad * MAX_GAMEPAD_AXES + axis`.
 */
export interface InputStateRaw extends EntityRaw {
  axisValues: Map<number, number>;
  gamepadButtonsDown: Set<number>;
  justPressedGamepadButtons: Set<number>;
  justPressedKeys: Set<number>;
  justReleasedGamepadButtons: Set<number>;
  justReleasedKeys: Set<number>;
  keysDown: Set<number>;
  pointerButtonsDown: Map<number, number>;
}

/**
 * A reusable key-repeat timer (TS `InputKeyRepeatTimer`, an Entity). Timing is driven by the
 * caller's explicit clock through `advanceInputKeyRepeatTimer`; no real timer is used.
 */
export interface InputKeyRepeatTimerRaw extends EntityRaw {}

/**
 * The timer's crate-private cycle state, kept in the entity's runtime slot in TypeScript.
 */
interface InputKeyRepeatTimerState {
  callback?: InputRepeatCallback;
  delayMs: number;
  intervalMs: number;
  nextFireMs: number;
  repeating: boolean;
  started: boolean;
}

export function getGamepadAxisKindString(value: GamepadAxisKind): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'StickLeftX':
        return 'StickLeftX';
      case 'StickLeftY':
        return 'StickLeftY';
      case 'StickRightX':
        return 'StickRightX';
      case 'StickRightY':
        return 'StickRightY';
    }
  })();
}

export function getGamepadButtonKindString(value: GamepadButtonKind): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ButtonEast':
        return 'ButtonEast';
      case 'ButtonNorth':
        return 'ButtonNorth';
      case 'ButtonSouth':
        return 'ButtonSouth';
      case 'ButtonWest':
        return 'ButtonWest';
      case 'DpadDown':
        return 'DpadDown';
      case 'DpadLeft':
        return 'DpadLeft';
      case 'DpadRight':
        return 'DpadRight';
      case 'DpadUp':
        return 'DpadUp';
      case 'Home':
        return 'Home';
      case 'Select':
        return 'Select';
      case 'ShoulderLeft':
        return 'ShoulderLeft';
      case 'ShoulderRight':
        return 'ShoulderRight';
      case 'Start':
        return 'Start';
      case 'StickLeft':
        return 'StickLeft';
      case 'StickRight':
        return 'StickRight';
      case 'Touchpad':
        return 'Touchpad';
      case 'TriggerLeft':
        return 'TriggerLeft';
      case 'TriggerRight':
        return 'TriggerRight';
    }
  })();
}

export function getGamepadMappingString(value: GamepadMapping): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'standard':
        return 'standard';
      case 'raw':
        return 'raw';
      case '':
        return '';
    }
  })();
}

export function getInputPointerLockExitReasonString(value: InputPointerLockExitReason): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ok':
        return 'ok';
      case 'api-unavailable':
        return 'api-unavailable';
      case 'operation-failed':
        return 'operation-failed';
    }
  })();
}

export function getInputPointerLockRequestReasonString(value: InputPointerLockRequestReason): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ok':
        return 'ok';
      case 'api-unavailable':
        return 'api-unavailable';
      case 'denied':
        return 'denied';
      case 'operation-failed':
        return 'operation-failed';
      case 'target-not-found':
        return 'target-not-found';
    }
  })();
}

export function getMouseWheelModeString(value: MouseWheelMode): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'lines':
        return 'lines';
      case 'pages':
        return 'pages';
      case 'pixels':
        return 'pixels';
      case 'unknown':
        return 'unknown';
    }
  })();
}

export function getPointerTypeString(value: PointerType): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'mouse':
        return 'mouse';
      case 'pen':
        return 'pen';
      case 'touch':
        return 'touch';
      case 'unknown':
        return 'unknown';
    }
  })();
}

export function parseGamepadAxisKind(value: string): GamepadAxisKind | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'StickLeftX':
        return 'StickLeftX';
      case 'StickLeftY':
        return 'StickLeftY';
      case 'StickRightX':
        return 'StickRightX';
      case 'StickRightY':
        return 'StickRightY';
      default:
        return undefined;
    }
  })();
}

export function parseGamepadButtonKind(value: string): GamepadButtonKind | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ButtonEast':
        return 'ButtonEast';
      case 'ButtonNorth':
        return 'ButtonNorth';
      case 'ButtonSouth':
        return 'ButtonSouth';
      case 'ButtonWest':
        return 'ButtonWest';
      case 'DpadDown':
        return 'DpadDown';
      case 'DpadLeft':
        return 'DpadLeft';
      case 'DpadRight':
        return 'DpadRight';
      case 'DpadUp':
        return 'DpadUp';
      case 'Home':
        return 'Home';
      case 'Select':
        return 'Select';
      case 'ShoulderLeft':
        return 'ShoulderLeft';
      case 'ShoulderRight':
        return 'ShoulderRight';
      case 'Start':
        return 'Start';
      case 'StickLeft':
        return 'StickLeft';
      case 'StickRight':
        return 'StickRight';
      case 'Touchpad':
        return 'Touchpad';
      case 'TriggerLeft':
        return 'TriggerLeft';
      case 'TriggerRight':
        return 'TriggerRight';
      default:
        return undefined;
    }
  })();
}

export function parseGamepadMapping(value: string): GamepadMapping | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'standard':
        return 'standard';
      case 'raw':
        return 'raw';
      case '':
        return '';
      default:
        return undefined;
    }
  })();
}

export function parseInputPointerLockExitReason(value: string): InputPointerLockExitReason | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ok':
        return 'ok';
      case 'api-unavailable':
        return 'api-unavailable';
      case 'operation-failed':
        return 'operation-failed';
      default:
        return undefined;
    }
  })();
}

export function parseInputPointerLockRequestReason(value: string): InputPointerLockRequestReason | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'ok':
        return 'ok';
      case 'api-unavailable':
        return 'api-unavailable';
      case 'denied':
        return 'denied';
      case 'operation-failed':
        return 'operation-failed';
      case 'target-not-found':
        return 'target-not-found';
      default:
        return undefined;
    }
  })();
}

export function parseMouseWheelMode(value: string): MouseWheelMode | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'lines':
        return 'lines';
      case 'pages':
        return 'pages';
      case 'pixels':
        return 'pixels';
      case 'unknown':
        return 'unknown';
      default:
        return undefined;
    }
  })();
}

export function parsePointerType(value: string): PointerType | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'mouse':
        return 'mouse';
      case 'pen':
        return 'pen';
      case 'touch':
        return 'touch';
      case 'unknown':
        return 'unknown';
      default:
        return undefined;
    }
  })();
}

// Crate-private `InputKeyRepeatTimer.cycle`, keyed by entity identity and reachable only from this package's modules.
const inputKeyRepeatTimerCycleStore = /* @__PURE__ */ new WeakMap<
  Readonly<InputKeyRepeatTimerRaw>,
  InputKeyRepeatTimerState
>();

export { inputKeyRepeatTimerCycleStore };

// Crate-private `InputManager.registry`, keyed by entity identity and reachable only from this package's modules.
const inputManagerRegistryStore = /* @__PURE__ */ new WeakMap<Readonly<InputManagerRaw>, InputManagerRuntime>();

export { inputManagerRegistryStore };

export type { InputKeyRepeatTimerState };
