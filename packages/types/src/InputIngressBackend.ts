import type { InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData } from './InputGamepadData';
import type { InputKeyboardData } from './InputKeyboardData';
import type { AttachInputOptions } from './InputManager';
import type { InputPointerData } from './InputPointerData';
import type { InputTextData } from './InputTextData';

/**
 * Host-neutral identity for one input source. The installed ingress backend interprets the exact
 * object identity; portable callers must not depend on DOM or native members.
 */
export type InputIngressSource = object;

/** Synchronous, borrowed normalized-event delivery owned by one InputManager attachment. */
export interface InputIngressSink {
  gamepadAxisMove(data: Readonly<InputGamepadAxisData>): void;
  gamepadButtonDown(data: Readonly<InputGamepadButtonData>): void;
  gamepadButtonUp(data: Readonly<InputGamepadButtonData>): void;
  gamepadConnect(data: Readonly<InputGamepadConnectData>): void;
  gamepadDisconnect(data: Readonly<InputGamepadConnectData>): void;
  isEnabled(): boolean;
  keyDown(data: Readonly<InputKeyboardData>): void;
  keyUp(data: Readonly<InputKeyboardData>): void;
  pointerCancel(data: Readonly<InputPointerData>): void;
  pointerDown(data: Readonly<InputPointerData>): void;
  pointerMove(data: Readonly<InputPointerData>): void;
  pointerMoveRelative(data: Readonly<InputPointerData>): void;
  pointerUp(data: Readonly<InputPointerData>): void;
  textEdit(data: Readonly<InputTextData>): void;
  textInput(data: Readonly<InputTextData>): void;
  wheel(data: Readonly<InputPointerData>): void;
}

/**
 * Process-wide input-ingress seam. Its canonical lifecycle and ownership contract is recorded in
 * `agents/backend-lifecycle-ownership.md`.
 */
export interface InputIngressBackend {
  attachGamepad(source: InputIngressSource, sink: InputIngressSink, options?: Readonly<AttachInputOptions>): () => void;
  attachKeyboard(
    source: InputIngressSource,
    sink: InputIngressSink,
    options?: Readonly<AttachInputOptions>,
  ): () => void;
  attachPointer(source: InputIngressSource, sink: InputIngressSink, options?: Readonly<AttachInputOptions>): () => void;
  attachRelativePointer(
    source: InputIngressSource,
    sink: InputIngressSink,
    options?: Readonly<AttachInputOptions>,
  ): () => void;
  attachText(source: InputIngressSource, sink: InputIngressSink, options?: Readonly<AttachInputOptions>): () => void;
  attachWheel(source: InputIngressSource, sink: InputIngressSink, options?: Readonly<AttachInputOptions>): () => void;
  exitPointerLock?(): void;
  hasPointerLock?(): boolean;
}
