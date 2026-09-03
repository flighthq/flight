import type { Entity } from './Entity';

// Independent IPC capabilities. Provider coverage varies by process side: an Electron renderer can
// send and invoke, while Electron main can receive messages, handle invokes, and send to a supplied
// target. Keeping each operation in its own Entity-backed slot makes that coverage a construction fact.

export interface IpcHandleBackend extends Entity {
  handle(channel: string, handler: (...args: readonly unknown[]) => unknown | Promise<unknown>): () => void;
}

export interface IpcInvokeBackend extends Entity {
  invoke(channel: string, args: readonly unknown[]): Promise<unknown>;
}

export interface IpcMessageBackend extends Entity {
  // Delivers messages arriving on `channel`, returning the unsubscribe for THAT subscription only.
  subscribe(channel: string, listener: (args: readonly unknown[]) => void): () => void;
}

export interface IpcSendBackend extends Entity {
  send(channel: string, args: readonly unknown[]): void;
}

// Target identity belongs to the provider and caller, not to IPC core. Electron can use any target
// satisfying its narrow send facade; another host may use an entirely different handle type.
export interface IpcTargetedSendBackend<Target = never> extends Entity {
  send(target: Target, channel: string, args: readonly unknown[]): void;
}
