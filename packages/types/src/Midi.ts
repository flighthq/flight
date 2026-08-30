import type { Entity } from './Entity';
import type { PermissionQueryOutcome } from './Permission';
import type { Signal } from './Signal';

// MIDI handles are origin-pinned Entities. IDs are immutable diagnostic metadata only; providers keep
// native handles and all mutable state out of band, keyed by the exact Entity object.
export interface MidiAccess extends Entity {}

export type MidiPortConnection = 'closed' | 'open' | 'pending';
export type MidiPortState = 'connected' | 'disconnected';

export interface MidiInputPort extends Entity {
  readonly id: string;
  readonly manufacturer: string | null;
  readonly name: string | null;
  readonly type: 'input';
  readonly version: string | null;
}

export interface MidiOutputPort extends Entity {
  readonly id: string;
  readonly manufacturer: string | null;
  readonly name: string | null;
  readonly type: 'output';
  readonly version: string | null;
}

export type MidiPort = MidiInputPort | MidiOutputPort;

export interface MidiInputMessage {
  readonly data: Uint8Array;
  readonly timestamp: number;
}

export type MidiAccessRequestOutcome =
  | { readonly access: MidiAccess; readonly reason: 'accepted' }
  | { readonly reason: 'operation-failed' | 'permission-denied' | 'security-restricted' | 'unsupported' };

export type MidiAccessPortsOutcome<Port extends MidiPort> =
  | { readonly ports: ReadonlyArray<Port>; readonly reason: 'ok' }
  | { readonly reason: 'disposed' | 'operation-failed' };

export interface MidiAccessLifecycleFailure {
  readonly id: string;
  readonly operation: 'close';
  readonly type: MidiPort['type'];
}

export type MidiAccessDisposeOutcome =
  | { readonly reason: 'already-disposed' | 'ok' }
  | {
      readonly failures: ReadonlyArray<Readonly<MidiAccessLifecycleFailure>>;
      readonly reason: 'operation-failed';
    };

export type MidiPortCloseOutcome = {
  readonly reason: 'already-closed' | 'closed' | 'disposed' | 'operation-failed';
};

export type MidiPortOpenOutcome = {
  readonly reason: 'already-open' | 'disconnected' | 'disposed' | 'opened' | 'operation-failed';
};

export type MidiPortConnectionOutcome =
  | { readonly connection: MidiPortConnection; readonly reason: 'ok' }
  | { readonly reason: 'disposed' | 'operation-failed' };

export type MidiPortStateOutcome =
  | { readonly reason: 'ok'; readonly state: MidiPortState }
  | { readonly reason: 'disposed' | 'operation-failed' };

export interface MidiPortLifecycleFailure {
  readonly operation: 'close';
}

export type MidiPortDisposeOutcome =
  | { readonly reason: 'already-disposed' | 'ok' }
  | {
      readonly failures: ReadonlyArray<Readonly<MidiPortLifecycleFailure>>;
      readonly reason: 'operation-failed';
    };

export type MidiMessageSendOutcome = {
  readonly reason:
    | 'disconnected'
    | 'disposed'
    | 'invalid-message'
    | 'not-open'
    | 'operation-failed'
    | 'sent'
    | 'system-exclusive-not-enabled';
};

export type MidiEventReleaseOutcome = {
  readonly reason: 'ok' | 'operation-failed';
};

export interface MidiEventAttachment extends Entity {
  release(): Promise<MidiEventReleaseOutcome>;
}

export type MidiEventBackendAttachOutcome =
  | { readonly attachment: MidiEventAttachment; readonly reason: 'ok' }
  | { readonly reason: 'operation-failed'; readonly releaseFailed: boolean };

export type MidiSubscriptionAttachOutcome =
  | { readonly reason: 'ok' }
  | {
      readonly attachFailed: boolean;
      readonly reason: 'operation-failed';
      readonly releaseFailed: boolean;
    };

export type MidiSubscriptionDetachOutcome =
  | { readonly reason: 'not-attached' | 'ok' }
  | { readonly reason: 'operation-failed'; readonly releaseFailed: true };

export type MidiSubscriptionDisposeOutcome =
  | { readonly reason: 'already-disposed' | 'ok' }
  | {
      readonly attachFailed: boolean;
      readonly reason: 'operation-failed';
      readonly releaseFailed: boolean;
    };

export interface MidiAccessStateSubscription extends Entity {
  readonly onMidiAccessStateChange: Signal<(port: Readonly<MidiPort>) => void>;
}

export interface MidiInputMessageSubscription extends Entity {
  readonly onMidiInputMessage: Signal<(message: Readonly<MidiInputMessage>) => void>;
}

export interface MidiPortStateSubscription extends Entity {
  readonly onMidiPortStateChange: Signal<(port: Readonly<MidiPort>) => void>;
}

export interface MidiAccessBackend extends Entity {
  requestAccess(): Promise<MidiAccessRequestOutcome>;
}

export interface MidiPermissionBackend extends Entity {
  getPermission(): Promise<PermissionQueryOutcome>;
}

export interface MidiAccessResourceOperations {
  attachStateChange(listener: (port: MidiPort) => void): Promise<MidiEventBackendAttachOutcome>;
  getInputPorts(): readonly MidiInputPort[];
  getOutputPorts(): readonly MidiOutputPort[];
}

export interface MidiPortResourceOperations {
  attachStateChange(listener: () => void): Promise<MidiEventBackendAttachOutcome>;
  close(): Promise<void>;
  getConnection(): MidiPortConnection;
  getState(): MidiPortState;
  open(): Promise<void>;
}

export interface MidiInputPortResourceOperations extends MidiPortResourceOperations {
  attachMessage(listener: (data: Uint8Array, timestamp: number) => void): Promise<MidiEventBackendAttachOutcome>;
}

export interface MidiOutputPortResourceOperations extends MidiPortResourceOperations {
  send(data: readonly number[], timestamp?: number): void;
}

export type WebMidiAccessCapabilities = Entity &
  Readonly<{
    access: MidiAccessBackend;
  }>;

export type WebMidiPermissionAccessCapabilities = Entity &
  Readonly<{
    access: MidiAccessBackend;
    permission: MidiPermissionBackend;
  }>;
