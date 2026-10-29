// Generated from crates/flight-input/src/input_binding.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { InputIngressSource } from '@flighthq/host/contract';
import { emitSignal } from '@flighthq/signals/contract';

import type {
  AttachInputOptions,
  HostInputIngressCapability,
  InputGamepadAxisData,
  InputGamepadButtonData,
  InputGamepadConnectData,
  InputIngressRelease,
  InputIngressSink,
  InputKeyboardData,
  InputManagerRaw,
  InputPointerData,
  InputTextData,
} from './types.ts';
import { inputManagerRegistryStore } from './types.ts';

enum InputBindingKind {
  Gamepad = 'gamepad',
  Keyboard = 'keyboard',
  Pointer = 'pointer',
  RelativePointer = 'relativePointer',
  Text = 'text',
  Wheel = 'wheel',
}

interface InputBinding {
  source: InputIngressSource;
  kind: InputBindingKind;
  release: InputIngressRelease;
}

interface InputManagerRuntime {
  sink?: InputIngressSink;
  bindings: InputBinding[];
}

/**
 * Attaches gamepad ingress (TS `attachGamepadInput`). The release is origin-pinned per manager,
 * source identity and input kind.
 */
export function attachGamepadInput(
  hostInputIngress: Readonly<HostInputIngressCapability>,
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  options?: Readonly<AttachInputOptions>,
): void {
  const sink = getOrCreateSink(manager);
  const release = hostInputIngress.attachGamepad(source, sink, options);
  setInputBinding(manager, source, InputBindingKind.Gamepad, release);
}

/**
 * Attaches keyboard ingress (TS `attachKeyboardInput`).
 */
export function attachKeyboardInput(
  hostInputIngress: Readonly<HostInputIngressCapability>,
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  options?: Readonly<AttachInputOptions>,
): void {
  const sink = getOrCreateSink(manager);
  const release = hostInputIngress.attachKeyboard(source, sink, options);
  setInputBinding(manager, source, InputBindingKind.Keyboard, release);
}

/**
 * Attaches pointer ingress (TS `attachPointerInput`).
 */
export function attachPointerInput(
  hostInputIngress: Readonly<HostInputIngressCapability>,
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  options?: Readonly<AttachInputOptions>,
): void {
  const sink = getOrCreateSink(manager);
  const release = hostInputIngress.attachPointer(source, sink, options);
  setInputBinding(manager, source, InputBindingKind.Pointer, release);
}

/**
 * Attaches relative-pointer ingress (TS `attachRelativePointerInput`).
 */
export function attachRelativePointerInput(
  hostInputIngress: Readonly<HostInputIngressCapability>,
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  options?: Readonly<AttachInputOptions>,
): void {
  const sink = getOrCreateSink(manager);
  const release = hostInputIngress.attachRelativePointer(source, sink, options);
  setInputBinding(manager, source, InputBindingKind.RelativePointer, release);
}

/**
 * Attaches text ingress (TS `attachTextInput`).
 */
export function attachTextInput(
  hostInputIngress: Readonly<HostInputIngressCapability>,
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  options?: Readonly<AttachInputOptions>,
): void {
  const sink = getOrCreateSink(manager);
  const release = hostInputIngress.attachText(source, sink, options);
  setInputBinding(manager, source, InputBindingKind.Text, release);
}

/**
 * Attaches wheel ingress (TS `attachWheelInput`).
 */
export function attachWheelInput(
  hostInputIngress: Readonly<HostInputIngressCapability>,
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  options?: Readonly<AttachInputOptions>,
): void {
  const sink = getOrCreateSink(manager);
  const release = hostInputIngress.attachWheel(source, sink, options);
  setInputBinding(manager, source, InputBindingKind.Wheel, release);
}

function buildInputIngressSink(manager: InputManagerRaw): InputIngressSink {
  const captured = manager;
  const gamepadAxisMove: (arg0: Readonly<InputGamepadAxisData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputGamepadAxisData>) => emitGamepadAxisMove(manager, data);
  })();
  const gamepadButtonDown: (arg0: Readonly<InputGamepadButtonData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputGamepadButtonData>) => emitGamepadButtonDown(manager, data);
  })();
  const gamepadButtonUp: (arg0: Readonly<InputGamepadButtonData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputGamepadButtonData>) => emitGamepadButtonUp(manager, data);
  })();
  const gamepadConnect: (arg0: Readonly<InputGamepadConnectData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputGamepadConnectData>) => emitGamepadConnect(manager, data);
  })();
  const gamepadDisconnect: (arg0: Readonly<InputGamepadConnectData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputGamepadConnectData>) => emitGamepadDisconnect(manager, data);
  })();
  const keyDown: (arg0: Readonly<InputKeyboardData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputKeyboardData>) => emitKeyDown(manager, data);
  })();
  const keyUp: (arg0: Readonly<InputKeyboardData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputKeyboardData>) => emitKeyUp(manager, data);
  })();
  const pointerCancel: (arg0: Readonly<InputPointerData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputPointerData>) => emitPointerCancel(manager, data);
  })();
  const pointerDown: (arg0: Readonly<InputPointerData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputPointerData>) => emitPointerDown(manager, data);
  })();
  const pointerMove: (arg0: Readonly<InputPointerData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputPointerData>) => emitPointerMove(manager, data);
  })();
  const pointerMoveRelative: (arg0: Readonly<InputPointerData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputPointerData>) => emitPointerMoveRelative(manager, data);
  })();
  const pointerUp: (arg0: Readonly<InputPointerData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputPointerData>) => emitPointerUp(manager, data);
  })();
  const textEdit: (arg0: Readonly<InputTextData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputTextData>) => emitTextEdit(manager, data);
  })();
  const textInput: (arg0: Readonly<InputTextData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputTextData>) => emitTextInput(manager, data);
  })();
  const wheel: (arg0: Readonly<InputPointerData>) => void = (() => {
    const manager = captured;
    return (data: Readonly<InputPointerData>) => emitWheel(manager, data);
  })();
  const isEnabled: () => boolean = (() => {
    const manager = captured;
    return () => isManagerEnabled(manager);
  })();
  return {
    gamepadAxisMove: gamepadAxisMove,
    gamepadButtonDown: gamepadButtonDown,
    gamepadButtonUp: gamepadButtonUp,
    gamepadConnect: gamepadConnect,
    gamepadDisconnect: gamepadDisconnect,
    isEnabled: isEnabled,
    keyDown: keyDown,
    keyUp: keyUp,
    pointerCancel: pointerCancel,
    pointerDown: pointerDown,
    pointerMove: pointerMove,
    pointerMoveRelative: pointerMoveRelative,
    pointerUp: pointerUp,
    textEdit: textEdit,
    textInput: textInput,
    wheel: wheel,
  };
}

function clearInputBinding(
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  kind: InputBindingKind,
): void {
  {
    const $release = takeInputBindingRelease(manager, source, kind);
    if ($release !== undefined) {
      const release = $release;
      release();
    }
  }
}

/**
 * Detaches gamepad ingress for exactly that manager/source binding (TS `detachGamepadInput`).
 */
export function detachGamepadInput(manager: InputManagerRaw, source: Readonly<InputIngressSource>): void {
  clearInputBinding(manager, source, InputBindingKind.Gamepad);
}

/**
 * Detaches keyboard ingress (TS `detachKeyboardInput`).
 */
export function detachKeyboardInput(manager: InputManagerRaw, source: Readonly<InputIngressSource>): void {
  clearInputBinding(manager, source, InputBindingKind.Keyboard);
}

/**
 * Detaches pointer ingress (TS `detachPointerInput`).
 */
export function detachPointerInput(manager: InputManagerRaw, source: Readonly<InputIngressSource>): void {
  clearInputBinding(manager, source, InputBindingKind.Pointer);
}

/**
 * Detaches relative-pointer ingress (TS `detachRelativePointerInput`).
 */
export function detachRelativePointerInput(manager: InputManagerRaw, source: Readonly<InputIngressSource>): void {
  clearInputBinding(manager, source, InputBindingKind.RelativePointer);
}

/**
 * Detaches text ingress (TS `detachTextInput`).
 */
export function detachTextInput(manager: InputManagerRaw, source: Readonly<InputIngressSource>): void {
  clearInputBinding(manager, source, InputBindingKind.Text);
}

/**
 * Detaches wheel ingress (TS `detachWheelInput`).
 */
export function detachWheelInput(manager: InputManagerRaw, source: Readonly<InputIngressSource>): void {
  clearInputBinding(manager, source, InputBindingKind.Wheel);
}

function emitGamepadAxisMove(manager: InputManagerRaw, data: Readonly<InputGamepadAxisData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onGamepadAxisMove;
  emitSignal(signal, data);
}

function emitGamepadButtonDown(manager: InputManagerRaw, data: Readonly<InputGamepadButtonData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onGamepadButtonDown;
  emitSignal(signal, data);
}

function emitGamepadButtonUp(manager: InputManagerRaw, data: Readonly<InputGamepadButtonData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onGamepadButtonUp;
  emitSignal(signal, data);
}

function emitGamepadConnect(manager: InputManagerRaw, data: Readonly<InputGamepadConnectData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onGamepadConnect;
  emitSignal(signal, data);
}

function emitGamepadDisconnect(manager: InputManagerRaw, data: Readonly<InputGamepadConnectData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onGamepadDisconnect;
  emitSignal(signal, data);
}

function emitKeyDown(manager: InputManagerRaw, data: Readonly<InputKeyboardData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onKeyDown;
  emitSignal(signal, data);
}

function emitKeyUp(manager: InputManagerRaw, data: Readonly<InputKeyboardData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onKeyUp;
  emitSignal(signal, data);
}

function emitPointerCancel(manager: InputManagerRaw, data: Readonly<InputPointerData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onPointerCancel;
  emitSignal(signal, data);
}

function emitPointerDown(manager: InputManagerRaw, data: Readonly<InputPointerData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onPointerDown;
  emitSignal(signal, data);
}

function emitPointerMove(manager: InputManagerRaw, data: Readonly<InputPointerData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onPointerMove;
  emitSignal(signal, data);
}

function emitPointerMoveRelative(manager: InputManagerRaw, data: Readonly<InputPointerData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onPointerMoveRelative;
  emitSignal(signal, data);
}

function emitPointerUp(manager: InputManagerRaw, data: Readonly<InputPointerData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onPointerUp;
  emitSignal(signal, data);
}

function emitTextEdit(manager: InputManagerRaw, data: Readonly<InputTextData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onTextEdit;
  emitSignal(signal, data);
}

function emitTextInput(manager: InputManagerRaw, data: Readonly<InputTextData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onTextInput;
  emitSignal(signal, data);
}

function emitWheel(manager: InputManagerRaw, data: Readonly<InputPointerData>): void {
  if (!isManagerEnabled(manager)) {
    return;
  }
  const signal = manager!.onWheel;
  emitSignal(signal, data);
}

function getInputManagerRegistry(manager: InputManagerRaw): InputManagerRuntime {
  return inputManagerRegistryStore.get(manager)!;
}

function getOrCreateSink(manager: InputManagerRaw): InputIngressSink {
  const candidate = buildInputIngressSink(manager);
  let locked = manager!;
  const registry = getInputManagerRegistry(locked);
  if (registry.sink !== undefined) {
    const sink = registry.sink;
    return sink;
  }
  registry.sink = candidate;
  return candidate;
}

function isManagerEnabled(manager: InputManagerRaw): boolean {
  return manager!.enabled;
}

function setInputBinding(
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  kind: InputBindingKind,
  release: InputIngressRelease,
): void {
  {
    const $previous = takeInputBindingRelease(manager, source, kind);
    if ($previous !== undefined) {
      const previous = $previous;
      previous();
    }
  }
  let locked = manager!;
  const registry = getInputManagerRegistry(locked);
  registry.bindings.push({ source: source, kind: kind, release: release });
}

function takeInputBindingRelease(
  manager: InputManagerRaw,
  source: Readonly<InputIngressSource>,
  kind: InputBindingKind,
): InputIngressRelease | undefined {
  let locked = manager!;
  const registry = getInputManagerRegistry(locked);
  let release = undefined;
  for (const binding of registry.bindings) {
    if (binding.kind === kind && binding.source.handle === source.handle) {
      release = binding.release;
      break;
    }
  }
  (<T>(items: T[], keep: (item: T) => boolean): void => {
    let kept = 0;
    let index = 0;
    try {
      for (; index < items.length; index += 1) {
        const item = items[index];
        if (keep(item)) {
          items[kept] = item;
          kept += 1;
        }
      }
    } finally {
      const length = items.length;
      for (let rest = index; rest < length; rest += 1) {
        items[kept + rest - index] = items[rest];
      }
      items.length = kept + length - index;
    }
  })(registry.bindings, (binding) => {
    return !(binding.kind === kind && binding.source.handle === source.handle);
  });
  return release;
}

export type { InputManagerRuntime };
